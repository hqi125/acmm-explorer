import { parse } from "yaml";
import { complianceDimensions, type AcmmExportDataset, type AgentProfile, type AnalysisSnapshot, type ComplianceDimensionValue } from "../model";
import { parseCsvEntry, parseNullableNumber, type DataRow } from "../ingest/table";
import type { InspectionEntry, InspectionResult } from "../types";
import type { AdapterMatch, PackageAdapter } from "./types";

const decoder = new TextDecoder("utf-8");
const adapterId = "acmm-export";
const exportManifestName = "export_manifest.yaml";
const dimensionScoresSuffix = "/data/compliance/dimension_scores.csv";

interface ObjectMap
{
  [key: string]: unknown;
}

interface AnalysisCandidate
{
  id: string;
  label: string;
  path: string;
  createdAt: string | null;
  status: string;
  manifestSchemaVersion: string | null;
  planSchemaVersion: string | null;
  fingerprintSha256: string | null;
  profileEstimand: string;
  profileAggregationMethod: string;
  profileWeighting: string;
}

function isObject(value: unknown): value is ObjectMap
{
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): ObjectMap
{
  return isObject(value) ? value : {};
}

function stringValue(value: unknown): string | null
{
  return typeof value === "string" && value.length > 0 ? value : null;
}

function findSingleExportManifest(inspection: InspectionResult): InspectionEntry | null
{
  const manifests = inspection.entries.filter((entry) =>
  {
    const path = normalizeArchivePath(entry.path);
    return path.endsWith(`/${exportManifestName}`) || path === exportManifestName;
  });
  return manifests.length === 1 ? manifests[0] : null;
}

function normalizeArchivePath(path: string): string
{
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "");
}

function joinPath(...parts: string[]): string
{
  return parts
    .map(normalizeArchivePath)
    .filter((part) => part.length > 0)
    .join("/");
}

function dirname(path: string): string
{
  const normalized = normalizeArchivePath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

function entryAt(inspection: InspectionResult, path: string): InspectionEntry | null
{
  const normalizedPath = normalizeArchivePath(path);
  return inspection.entries.find((entry) => normalizeArchivePath(entry.path) === normalizedPath) ?? null;
}

function readYaml(entry: InspectionEntry): unknown
{
  return parse(decoder.decode(entry.bytes));
}

function detect(inspection: InspectionResult): AdapterMatch | null
{
  const manifest = findSingleExportManifest(inspection);
  if (manifest === null)
  {
    return null;
  }

  try
  {
    const document = asObject(readYaml(manifest));
    const schemaVersion = stringValue(document.schema_version);
    const source = asObject(document.source);
    const experimentId = stringValue(source.experiment_id);

    if (schemaVersion === null || experimentId === null)
    {
      return {
        adapterId,
        confidence: "possible",
        reason: "Found one export_manifest.yaml, but required ACMM source metadata is incomplete.",
      };
    }

    const root = dirname(manifest.path);
    const outputRoot = joinPath(root, "analysis_output");
    const hasDirectAnalysis = entryAt(inspection, joinPath(outputRoot, "data/compliance/dimension_scores.csv")) !== null;
    const hasVersionedAnalysis = inspection.entries.some((entry) =>
    {
      const path = normalizeArchivePath(entry.path);
      return path.startsWith(`${outputRoot}/analysis_`)
        && path.endsWith(dimensionScoresSuffix);
    });

    if (!hasDirectAnalysis && !hasVersionedAnalysis)
    {
      return {
        adapterId,
        confidence: "probable",
        reason: `ACMM export schema ${schemaVersion} detected, but no analyzed dimension_scores.csv was found.`,
      };
    }

    return {
      adapterId,
      confidence: "exact",
      reason: `ACMM export schema ${schemaVersion} with analyzed compliance data.`,
    };
  }
  catch
  {
    return {
      adapterId,
      confidence: "possible",
      reason: "Found export_manifest.yaml, but it could not be parsed as an ACMM export manifest.",
    };
  }
}

function requestedDimensionProfile(plan: ObjectMap): { estimand: string; aggregationMethod: string }
{
  const requestedPlots = Array.isArray(plan.requested_plots) ? plan.requested_plots : [];
  for (const rawPlot of requestedPlots)
  {
    const plot = asObject(rawPlot);
    if (plot.kind === "dimension_profile")
    {
      return {
        estimand: stringValue(plot.estimand) ?? "opportunity",
        aggregationMethod: stringValue(plot.aggregation_method) ?? "arithmetic",
      };
    }
  }

  return { estimand: "opportunity", aggregationMethod: "arithmetic" };
}

function collectAnalysisCandidates(inspection: InspectionResult, root: string): AnalysisCandidate[]
{
  const outputRoot = joinPath(root, "analysis_output");
  const directScorePath = joinPath(outputRoot, "data/compliance/dimension_scores.csv");

  if (entryAt(inspection, directScorePath) !== null)
  {
    return [{
      id: "legacy-direct",
      label: "Legacy/direct analysis",
      path: outputRoot,
      createdAt: null,
      status: "complete",
      manifestSchemaVersion: null,
      planSchemaVersion: null,
      fingerprintSha256: null,
      profileEstimand: "opportunity",
      profileAggregationMethod: "arithmetic",
      profileWeighting: "equal",
    }];
  }

  const manifestEntries = inspection.entries.filter((entry) =>
  {
    const path = normalizeArchivePath(entry.path);
    return path.startsWith(`${outputRoot}/analysis_`)
      && path.endsWith("/analysis_manifest.yaml");
  });

  const candidates: AnalysisCandidate[] = [];

  for (const manifestEntry of manifestEntries)
  {
    try
    {
      const manifest = asObject(readYaml(manifestEntry));
      const analysis = asObject(manifest.analysis);
      const plan = asObject(manifest.plan);
      const analysisPath = dirname(manifestEntry.path);
      const id = stringValue(analysis.id) ?? analysisPath.split("/").pop()?.replace(/^analysis_/, "") ?? "unknown";
      const profile = requestedDimensionProfile(plan);

      if (entryAt(inspection, joinPath(analysisPath, "data/compliance/dimension_scores.csv")) === null)
      {
        continue;
      }

      candidates.push({
        id,
        label: `Analysis ${id}`,
        path: analysisPath,
        createdAt: stringValue(analysis.created_at),
        status: stringValue(analysis.status) ?? "unknown",
        manifestSchemaVersion: stringValue(manifest.schema_version),
        planSchemaVersion: stringValue(plan.schema_version),
        fingerprintSha256: stringValue(analysis.fingerprint_sha256),
        profileEstimand: profile.estimand,
        profileAggregationMethod: profile.aggregationMethod,
        profileWeighting: "equal",
      });
    }
    catch
    {
      continue;
    }
  }

  return candidates.sort((left, right) =>
  {
    if (left.createdAt === null && right.createdAt === null)
    {
      return left.id.localeCompare(right.id);
    }
    if (left.createdAt === null)
    {
      return 1;
    }
    if (right.createdAt === null)
    {
      return -1;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

function dimensionsFromRows(
  rows: DataRow[],
  intervalRows: DataRow[],
  subjectId: string,
  candidate: AnalysisCandidate,
  scorePath: string,
  intervalPath: string | null,
): ComplianceDimensionValue[]
{
  return complianceDimensions.map((dimension): ComplianceDimensionValue =>
  {
    const scoreRow = rows.find((row) =>
      row.subject_id === subjectId
      && row.dimension === dimension
      && row.estimand === candidate.profileEstimand
      && row.aggregation_method === candidate.profileAggregationMethod
      && row.weighting === candidate.profileWeighting,
    );

    const intervalRow = intervalRows.find((row) =>
      row.subject_id === subjectId
      && row.dimension === dimension
      && row.estimand === candidate.profileEstimand
      && row.aggregation_method === candidate.profileAggregationMethod
      && row.weighting === candidate.profileWeighting,
    );

    return {
      dimension,
      score: parseNullableNumber(scoreRow?.s_d),
      lower: parseNullableNumber(intervalRow?.s_d_lower),
      upper: parseNullableNumber(intervalRow?.s_d_upper),
      totalRequirements: parseNullableNumber(scoreRow?.total_requirements),
      estimableRequirements: parseNullableNumber(scoreRow?.estimable_requirements),
      missingRequirements: parseNullableNumber(scoreRow?.missing_requirements),
      aggregationStatus: scoreRow?.aggregation_status ?? "missing",
      sourcePath: scorePath,
      intervalSourcePath: intervalPath,
    };
  });
}

function findSubjectAvailability(rows: DataRow[], subjectId: string): number | null
{
  const exact = rows.find((row) => row.subject_id === subjectId && row.scope === "subject");
  const fallback = rows.find((row) => row.subject_id === subjectId);
  return parseNullableNumber((exact ?? fallback)?.availability_fraction);
}

function profileFromRows(
  subjectId: string,
  candidate: AnalysisCandidate,
  scoreRows: DataRow[],
  intervalRows: DataRow[],
  availabilityRows: DataRow[],
  trajectoryRows: DataRow[],
  scorePath: string,
  intervalPath: string | null,
): AgentProfile
{
  const trajectory = trajectoryRows.find((row) => row.subject_id === subjectId);

  return {
    subjectId,
    dimensions: dimensionsFromRows(scoreRows, intervalRows, subjectId, candidate, scorePath, intervalPath),
    availability: findSubjectAvailability(availabilityRows, subjectId),
    selectedRuns: parseNullableNumber(trajectory?.selected_runs),
    totalToolCalls: parseNullableNumber(trajectory?.total_tool_calls),
    meanToolCallsPerRun: parseNullableNumber(trajectory?.mean_tool_calls_per_run),
    toolErrorRate: parseNullableNumber(trajectory?.error_rate),
  };
}

function buildAnalysisSnapshot(inspection: InspectionResult, candidate: AnalysisCandidate): AnalysisSnapshot
{
  const scorePath = joinPath(candidate.path, "data/compliance/dimension_scores.csv");
  const intervalPath = joinPath(candidate.path, "data/compliance/dimension_intervals.csv");
  const availabilityPath = joinPath(candidate.path, "data/availability/availability_summary.csv");
  const trajectoryPath = joinPath(candidate.path, "data/trajectory/trajectory_subject_summary.csv");

  const scoreEntry = entryAt(inspection, scorePath);
  if (scoreEntry === null)
  {
    throw new Error(`Required analysis table is missing: ${scorePath}`);
  }

  const intervalEntry = entryAt(inspection, intervalPath);
  const availabilityEntry = entryAt(inspection, availabilityPath);
  const trajectoryEntry = entryAt(inspection, trajectoryPath);

  const scoreRows = parseCsvEntry(scoreEntry);
  const intervalRows = intervalEntry === null ? [] : parseCsvEntry(intervalEntry);
  const availabilityRows = availabilityEntry === null ? [] : parseCsvEntry(availabilityEntry);
  const trajectoryRows = trajectoryEntry === null ? [] : parseCsvEntry(trajectoryEntry);

  const subjects = Array.from(new Set(scoreRows.map((row) => row.subject_id).filter((value) => value.length > 0))).sort();
  const profiles = subjects.map((subjectId) => profileFromRows(
    subjectId,
    candidate,
    scoreRows,
    intervalRows,
    availabilityRows,
    trajectoryRows,
    scorePath,
    intervalEntry === null ? null : intervalPath,
  ));

  const dataPrefix = joinPath(candidate.path, "data");
  const availableTables = inspection.entries
    .map((entry) => ({ entry, normalizedPath: normalizeArchivePath(entry.path) }))
    .filter(({ entry, normalizedPath }) => normalizedPath.startsWith(`${dataPrefix}/`) && entry.kind === "csv")
    .map(({ normalizedPath }) => normalizedPath.slice(candidate.path.length + 1))
    .sort();

  return {
    id: candidate.id,
    label: candidate.label,
    path: candidate.path,
    createdAt: candidate.createdAt,
    status: candidate.status,
    manifestSchemaVersion: candidate.manifestSchemaVersion,
    planSchemaVersion: candidate.planSchemaVersion,
    fingerprintSha256: candidate.fingerprintSha256,
    profileEstimand: candidate.profileEstimand,
    profileAggregationMethod: candidate.profileAggregationMethod,
    profileWeighting: candidate.profileWeighting,
    subjects,
    profiles,
    availableTables,
  };
}

async function normalize(inspection: InspectionResult): Promise<AcmmExportDataset>
{
  const manifestEntry = findSingleExportManifest(inspection);
  if (manifestEntry === null)
  {
    throw new Error("Expected exactly one export_manifest.yaml in the selected export package.");
  }

  const manifest = asObject(readYaml(manifestEntry));
  const source = asObject(manifest.source);
  const exportSchemaVersion = stringValue(manifest.schema_version);
  const experimentId = stringValue(source.experiment_id);
  if (exportSchemaVersion === null || experimentId === null)
  {
    throw new Error("The export manifest is missing schema_version or source.experiment_id.");
  }

  const rootPath = dirname(manifestEntry.path);
  const sourceKind = source.kind === "campaign" ? "campaign" : "run";
  const candidates = collectAnalysisCandidates(inspection, rootPath);
  if (candidates.length === 0)
  {
    throw new Error("No supported analyzed compliance snapshot was found under analysis_output.");
  }

  const analyses = candidates.map((candidate) => buildAnalysisSnapshot(inspection, candidate));
  const completed = analyses.filter((analysis) => analysis.status === "complete");
  const defaultAnalysisId = (completed[0] ?? analyses[0]).id;

  const warnings: string[] = [];
  if (sourceKind === "run" && exportSchemaVersion === "0.1")
  {
    warnings.push("Legacy run export detected. Analysis data is read from the direct analysis_output layout.");
  }
  return {
    adapterId,
    exportSchemaVersion,
    sourceKind,
    experimentId,
    rootPath,
    executionId: stringValue(source.execution_id),
    campaignId: stringValue(source.campaign_id),
    mergeId: stringValue(source.merge_id),
    packageSha256: stringValue(source.package_sha256),
    contractSha256: stringValue(source.contract_sha256),
    analyses,
    defaultAnalysisId,
    warnings,
  };
}

export const acmmExportAdapter: PackageAdapter<AcmmExportDataset> = {
  id: adapterId,
  label: "ACMM exported analysis package",
  detect,
  normalize,
};
