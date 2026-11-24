import generatedSchemaCatalog from "./generated/schema-catalog.json";

export type ReferenceKind = "Command" | "Schema" | "Artifact" | "Package" | "Yaml" | "Field" | "Concept";
export type ReferenceSourceStatus = "observed-export" | "project-context" | "explorer-local" | "generated-schema" | "generated-package";

export interface ReferenceField
{
  name: string;
  description?: string;
  entryId?: string;
}

export interface ReferenceMetadata
{
  label: string;
  value: string;
}

export interface ReferenceEntry
{
  id: string;
  kind: ReferenceKind;
  name: string;
  summary: string;
  sourceStatus: ReferenceSourceStatus;
  sourceLabel: string;
  sourceNote: string;
  aliases?: string[];
  purpose?: string;
  whenToUse?: string;
  syntax?: string[];
  examples?: string[];
  fields?: ReferenceField[];
  notes?: string[];
  metadata?: ReferenceMetadata[];
  related?: string[];
  navigationGroup?: string[];
  navigationParentId?: string;
}

const observedBoth = "Observed in both supplied analyzed export packages (legacy run export schema 0.1 and current campaign export schema 0.3).";
const observedCurrent = "Observed in the supplied current campaign export analysis output. Older Experiment 1 analysis output does not contain this trajectory table.";
const projectContext = "Project-context entry. Exact exhaustive option/schema documentation remains intentionally deferred until the frozen source repositories are imported into the reference generator.";

const curatedReferenceEntries: ReferenceEntry[] = [
  {
    id: "command-acmm-run",
    kind: "Command",
    name: "acmm run",
    summary: "Single-execution entry point used by the legacy Experiment 1 workflow.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["run", "execution", "single run"],
    purpose: "Start or preview one execution path without creating a durable campaign container.",
    whenToUse: "Use when the experiment is being executed directly rather than through the campaign workflow.",
    syntax: ["acmm run"],
    notes: [
      "Experiment 1 was executed through this entry point.",
      "Current project context also references run-level preview, apply/start helpers, runtime-log capture, and apparatus cleanup options; the complete option list is pending source import.",
    ],
    related: ["concept-execution", "command-acmm-campaign-execute", "schema-export-manifest"],
  },
  {
    id: "command-acmm-campaign-execute",
    kind: "Command",
    name: "acmm campaign execute",
    summary: "Durable multi-run campaign execution entry point used by Experiment 2.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["campaign", "campaign execute", "durable execution"],
    purpose: "Execute a campaign while preserving campaign-level progress and later merge/adjudication operations.",
    whenToUse: "Use for the current multi-run workflow where execution, merge, adjudication, and analysis are managed as durable stages.",
    syntax: ["acmm campaign execute"],
    notes: [
      "Experiment 2 was executed through the campaign entry point.",
      "The current project includes campaign preview and interruption/resume work; exact flags are pending frozen-source import.",
    ],
    related: ["concept-campaign", "command-acmm-campaign-merge", "schema-export-manifest"],
  },
  {
    id: "command-acmm-campaign-merge",
    kind: "Command",
    name: "acmm campaign merge",
    summary: "Merge campaign execution outputs into a campaign-level result set.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["merge", "campaign merge", "adjudication merge"],
    purpose: "Produce the merged campaign population that can then be exported and analyzed.",
    whenToUse: "Use after campaign execution when the campaign result needs to be consolidated for adjudication/export/analysis.",
    syntax: ["acmm campaign merge", "acmm campaign merge --adjudication"],
    notes: ["Explicit adjudication output is stored separately and can be incorporated through the merge workflow."],
    related: ["concept-campaign", "concept-adjudication", "schema-export-manifest"],
  },
  {
    id: "command-acmm-package-apply",
    kind: "Command",
    name: "acmm package apply",
    summary: "Apply an experiment package contract to the local apparatus.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["package", "apply", "experiment package"],
    purpose: "Install/apply the experiment package state before execution.",
    whenToUse: "Use when a package version must be applied explicitly rather than relying on an execution helper to apply it automatically.",
    syntax: ["acmm package apply"],
    related: ["concept-experiment-package"],
  },
  {
    id: "command-apparatus-cleanup",
    kind: "Command",
    name: "acmm run apparatus cleanup --execution",
    summary: "Clean execution apparatus state for a selected execution boundary.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["apparatus cleanup", "cleanup", "execution cleanup"],
    purpose: "Remove generated execution-side apparatus state without changing frozen source repositories.",
    whenToUse: "Use during controlled testing when an execution boundary needs to be reset before a new run slice.",
    syntax: ["acmm run apparatus cleanup --execution"],
    related: ["concept-execution"],
  },
  {
    id: "concept-gobpfr",
    kind: "Concept",
    name: "GOBPFR",
    summary: "The six-dimensional ACMM compliance profile: Goal, Obligation, Boundary, Procedure, Fidelity, and Recovery.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["profile", "dimensions", "compliance dimensions"],
    purpose: "Represent agent compliance behavior as a profile rather than collapse it into a single universal good/bad score.",
    notes: [
      "Explorer renders these six dimensions on the canonical radar chart.",
      "Decision Workshop recipes may consume the profile, but their rankings remain conditional user-defined outputs rather than canonical ACMM scores.",
    ],
    related: ["schema-dimension-scores", "schema-dimension-intervals", "concept-decision-recipe"],
  },
  {
    id: "concept-experiment-package",
    kind: "Concept",
    name: "Experiment package",
    summary: "Deployable experiment contract and code bundle identified by a package SHA.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["package SHA", "package id", "contract"],
    purpose: "Bind an experiment definition and its implementation to an immutable version used for execution and provenance.",
    related: ["command-acmm-package-apply", "schema-export-manifest", "schema-analysis-manifest"],
  },
  {
    id: "concept-execution",
    kind: "Concept",
    name: "Execution",
    summary: "A concrete run-oriented execution instance identified by an execution ID.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["execution id", "run source"],
    purpose: "Provide the execution provenance used by direct `acmm run` workflows and legacy export manifests.",
    related: ["command-acmm-run", "schema-export-manifest", "concept-campaign"],
  },
  {
    id: "concept-campaign",
    kind: "Concept",
    name: "Campaign",
    summary: "Durable multi-run execution container with merge, adjudication, and resume-oriented lifecycle support.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["campaign id", "campaign execution"],
    purpose: "Provide a durable orchestration boundary around many planned runs and their later merge/analysis stages.",
    related: ["command-acmm-campaign-execute", "command-acmm-campaign-merge", "schema-export-manifest"],
  },
  {
    id: "concept-adjudication",
    kind: "Concept",
    name: "Adjudication",
    summary: "Explicit judgment stage that resolves run-level compliance observations before merged analysis.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["judgment", "re-adjudication", "campaign adjudication"],
    purpose: "Turn observed run behavior into the judgment records consumed by compliance analysis while preserving adjudication provenance separately from execution.",
    related: ["command-acmm-campaign-merge", "schema-export-manifest", "schema-analysis-manifest"],
  },
  {
    id: "concept-evaluability-boundary",
    kind: "Concept",
    name: "Evaluability boundary",
    summary: "Validity principle that separates apparatus invalidation from agent behavior signals.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["validity", "invalid run", "invented tools"],
    purpose: "Keep behavior such as invented tool calls observable as fidelity/recovery evidence unless the apparatus itself crosses a validity boundary.",
    related: ["concept-gobpfr", "concept-availability"],
  },
  {
    id: "concept-availability",
    kind: "Concept",
    name: "Availability",
    summary: "Analysis of whether planned execution slots produced valid evaluable results, including retry recovery.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedBoth,
    aliases: ["valid slots", "retry recovery", "first-attempt availability"],
    purpose: "Describe analysis coverage and execution validity separately from the GOBPFR compliance profile.",
    notes: ["Decision Workshop may use Availability as an eligibility metric, but it is not a seventh GOBPFR dimension."],
    related: ["schema-availability-summary", "schema-availability-cells", "concept-gobpfr"],
  },
  {
    id: "concept-provider-gate",
    kind: "Concept",
    name: "Provider Gate",
    summary: "Core execution boundary for provider-pressure admission and recovery decisions.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["provider pressure", "gate", "rate governance"],
    purpose: "Provide one actuation surface for provider pacing while keeping provider-specific classification and recovery interpretation in the experiment package.",
    related: ["concept-pph", "concept-app", "concept-pqe"],
  },
  {
    id: "concept-pph",
    kind: "Concept",
    name: "PPH",
    summary: "Provider Pressure Heuristics: event-level admission/recovery logic that learns provider pacing pressure.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["Provider Pressure Heuristics", "event PPH"],
    related: ["concept-provider-gate", "concept-app", "concept-pqe"],
  },
  {
    id: "concept-app",
    kind: "Concept",
    name: "APP",
    summary: "Adaptive Pressure Pocket: episode-oriented burst/pressure control used by the Provider Gate.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["Adaptive Pressure Pocket", "pressure pocket"],
    notes: ["The term episode is reserved for APP in the current provider-pressure model."],
    related: ["concept-provider-gate", "concept-pph", "concept-pqe"],
  },
  {
    id: "concept-pqe",
    kind: "Concept",
    name: "PQE",
    summary: "Provider Quota Estimator: static provider status/limit estimation component.",
    sourceStatus: "project-context",
    sourceLabel: "Project context",
    sourceNote: projectContext,
    aliases: ["Provider Quota Estimator", "quota estimator"],
    related: ["concept-provider-gate", "concept-pph", "concept-app"],
  },
  {
    id: "concept-analysis-snapshot",
    kind: "Concept",
    name: "Analysis snapshot",
    summary: "One completed analysis instance inside an export, identified by an analysis ID and analysis manifest.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: "Observed in the supplied campaign export, which contains three completed analysis snapshots with different analysis-plan schema versions.",
    aliases: ["analysis id", "analysis manifest", "analysis plan"],
    purpose: "Allow several analysis configurations to coexist inside one exported campaign package without overwriting prior analysis output.",
    related: ["schema-analysis-manifest", "schema-analysis-plan", "schema-export-manifest"],
  },
  {
    id: "concept-decision-recipe",
    kind: "Concept",
    name: "Decision recipe",
    summary: "Explorer-local saved decision function that conditionally ranks canonical ACMM profiles.",
    sourceStatus: "explorer-local",
    sourceLabel: "Explorer local",
    sourceNote: "Defined by ACMM Explorer, not by frozen ACMM Core. Recipe output is conditional and must not be interpreted as a canonical ACMM good/bad score.",
    aliases: ["decision function", "workshop recipe", "ranking function"],
    purpose: "Store a score expression, parameters, normalization groups, evidence basis, and eligibility rules as a reproducible local decision model.",
    related: ["concept-gobpfr"],
  },
  {
    id: "schema-export-manifest",
    kind: "Artifact",
    name: "export_manifest.yaml",
    summary: "Top-level export manifest describing export schema version, provenance, and exported tables.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: "Observed in both supplied exports. Legacy schema 0.1 uses top-level `source` and `tables`; current schema 0.3 additionally includes `executions` and campaign/merge/adjudication provenance.",
    aliases: ["export manifest", "schema 0.1", "schema 0.3"],
    purpose: "Identify the export contract and provide the root provenance Explorer uses to detect an ACMM export package.",
    fields: [
      { name: "schema_version", description: "Export manifest schema version." },
      { name: "source", description: "Execution or campaign provenance." },
      { name: "executions", description: "Current campaign export execution list; not present in the supplied legacy schema 0.1 export." },
      { name: "tables", description: "Exported table metadata including artifact path, row count, and SHA where present." },
    ],
    related: ["schema-analysis-manifest", "concept-execution", "concept-campaign"],
  },
  {
    id: "schema-analysis-manifest",
    kind: "Artifact",
    name: "analysis_manifest.yaml",
    summary: "Manifest for one versioned analysis snapshot in the current campaign export layout.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: "Observed in the supplied Experiment 2 export. The legacy Experiment 1 direct analysis layout does not contain this per-analysis manifest layer.",
    aliases: ["analysis manifest", "analysis schema", "analysis id"],
    fields: [
      { name: "schema_version" },
      { name: "analysis", description: "Analysis ID, fingerprint, status, and creation time." },
      { name: "source", description: "Export/campaign/package/adjudication provenance." },
      { name: "plan", description: "Analysis-plan schema/artifact and requested analyses/reports/plots." },
      { name: "implementation" },
      { name: "runtime" },
      { name: "stages" },
      { name: "artifacts" },
    ],
    related: ["concept-analysis-snapshot", "schema-analysis-plan", "schema-export-manifest"],
  },
  {
    id: "schema-analysis-plan",
    kind: "Artifact",
    name: "analysis_plan.yaml",
    summary: "Requested analysis configuration associated with one analysis snapshot.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: "Observed in the supplied current campaign export. Three snapshots use analysis-plan schema versions 0.2, 0.3, and 0.4.",
    aliases: ["analysis plan", "plan schema"],
    purpose: "Record which analyses, reports, and plots were requested for a snapshot so rendered results can be interpreted in context.",
    related: ["schema-analysis-manifest", "concept-analysis-snapshot"],
  },
  {
    id: "schema-dimension-scores",
    kind: "Artifact",
    name: "dimension_scores.csv",
    summary: "Canonical dimension-score table used by Explorer to render GOBPFR point-estimate profiles.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedBoth,
    aliases: ["dimension scores", "GOBPFR score", "s_d"],
    purpose: "Provide one dimension score per subject/estimand/aggregation/weighting combination.",
    fields: [
      { name: "estimand" }, { name: "subject_id" }, { name: "dimension" }, { name: "aggregation_method" },
      { name: "weighting" }, { name: "total_requirements" }, { name: "estimable_requirements" },
      { name: "missing_requirements" }, { name: "s_d", description: "Dimension score." }, { name: "aggregation_status" },
    ],
    related: ["concept-gobpfr", "schema-dimension-intervals", "schema-requirement-estimates"],
  },
  {
    id: "schema-dimension-intervals",
    kind: "Artifact",
    name: "dimension_intervals.csv",
    summary: "Dimension score table with confidence-interval metadata and lower/upper bounds.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedBoth,
    aliases: ["dimension intervals", "confidence bounds", "lower bound"],
    fields: [
      { name: "estimand" }, { name: "subject_id" }, { name: "dimension" }, { name: "aggregation_method" }, { name: "weighting" },
      { name: "total_requirements" }, { name: "estimable_requirements" }, { name: "missing_requirements" }, { name: "s_d" },
      { name: "aggregation_status" }, { name: "confidence_level" }, { name: "interval_method" }, { name: "scenario_clusters" },
      { name: "run_clusters" }, { name: "bootstrap_replicates_requested" }, { name: "s_d_lower" }, { name: "s_d_upper" },
      { name: "s_d_bootstrap_replicates" }, { name: "s_d_interval_status" },
    ],
    related: ["schema-dimension-scores", "concept-gobpfr", "concept-decision-recipe"],
  },
  {
    id: "schema-requirement-estimates",
    kind: "Artifact",
    name: "requirement_estimates.csv",
    summary: "Requirement-level compliance estimates and coverage counts used by the Requirements detail view.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedBoth,
    aliases: ["requirements", "p_hat", "coverage"],
    fields: [
      { name: "estimand" }, { name: "subject_id" }, { name: "requirement_id" }, { name: "dimension" },
      { name: "compliant" }, { name: "violation" }, { name: "unadjudicable" }, { name: "not_applicable" },
      { name: "adjudicable" }, { name: "applicable" }, { name: "p_hat", description: "Requirement compliance estimate." },
      { name: "coverage" }, { name: "total_runs" }, { name: "estimable_runs" }, { name: "applicable_runs" },
      { name: "total_scenarios" }, { name: "estimable_scenarios" }, { name: "applicable_scenarios" },
    ],
    related: ["schema-requirement-intervals", "schema-dimension-scores"],
  },
  {
    id: "schema-requirement-intervals",
    kind: "Artifact",
    name: "requirement_intervals.csv",
    summary: "Requirement estimates plus confidence intervals for compliance and coverage.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedBoth,
    aliases: ["requirement intervals", "p_hat lower", "coverage interval"],
    fields: [
      { name: "estimand" }, { name: "subject_id" }, { name: "requirement_id" }, { name: "dimension" },
      { name: "compliant" }, { name: "violation" }, { name: "unadjudicable" }, { name: "not_applicable" },
      { name: "adjudicable" }, { name: "applicable" }, { name: "p_hat" }, { name: "coverage" },
      { name: "confidence_level" }, { name: "interval_method" }, { name: "scenario_clusters" }, { name: "run_clusters" },
      { name: "bootstrap_replicates_requested" }, { name: "p_hat_lower" }, { name: "p_hat_upper" },
      { name: "p_hat_bootstrap_replicates" }, { name: "p_hat_interval_status" }, { name: "coverage_lower" },
      { name: "coverage_upper" }, { name: "coverage_bootstrap_replicates" }, { name: "coverage_interval_status" },
      { name: "total_runs" }, { name: "estimable_runs" }, { name: "applicable_runs" }, { name: "total_scenarios" },
      { name: "estimable_scenarios" }, { name: "applicable_scenarios" },
    ],
    related: ["schema-requirement-estimates", "schema-dimension-intervals"],
  },
  {
    id: "schema-availability-summary",
    kind: "Artifact",
    name: "availability_summary.csv",
    summary: "Subject/scope availability totals including first-attempt validity and retry recovery.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedBoth,
    aliases: ["availability", "retry recovery", "planned slots"],
    fields: [
      { name: "scope" }, { name: "subject_id" }, { name: "planned_slots" }, { name: "available_valid_slots" },
      { name: "unavailable_slots" }, { name: "availability_fraction" }, { name: "first_attempt_valid_slots" },
      { name: "first_attempt_availability_fraction" }, { name: "retried_slots" }, { name: "recovered_by_retry_slots" },
      { name: "retry_recovery_fraction" }, { name: "total_attempts" }, { name: "invalid_attempts" }, { name: "mean_attempts_per_slot" },
    ],
    related: ["concept-availability", "schema-availability-cells"],
  },
  {
    id: "schema-availability-cells",
    kind: "Artifact",
    name: "availability_cells.csv",
    summary: "Scenario-by-subject availability cells used by the detailed Availability view.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedBoth,
    aliases: ["availability cells", "scenario availability"],
    fields: [
      { name: "subject_id" }, { name: "scenario_id" }, { name: "planned_slots" }, { name: "available_valid_slots" },
      { name: "unavailable_slots" }, { name: "availability_fraction" }, { name: "first_attempt_valid_slots" },
      { name: "first_attempt_availability_fraction" }, { name: "retried_slots" }, { name: "recovered_by_retry_slots" },
    ],
    related: ["schema-availability-summary", "concept-availability"],
  },
  {
    id: "schema-trajectory-subject",
    kind: "Artifact",
    name: "trajectory_subject_summary.csv",
    summary: "Per-subject tool-trajectory summary available in the newer Experiment 2 analysis output.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedCurrent,
    aliases: ["trajectory", "tool calls", "tool errors"],
    fields: [
      { name: "subject_id" }, { name: "selected_runs" }, { name: "total_tool_calls" }, { name: "mean_tool_calls_per_run" },
      { name: "median_tool_calls_per_run" }, { name: "total_distinct_tool_names" }, { name: "mean_distinct_tools_per_run" },
      { name: "total_tool_results" }, { name: "error_results" }, { name: "error_rate" }, { name: "repeated_calls" },
      { name: "consecutive_repeated_calls" }, { name: "unmatched_calls" }, { name: "unmatched_results" },
    ],
    related: ["schema-trajectory-tool", "schema-trajectory-run"],
  },
  {
    id: "schema-trajectory-tool",
    kind: "Artifact",
    name: "trajectory_tool_usage.csv",
    summary: "Per-subject, per-tool usage counts and result error rates.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedCurrent,
    aliases: ["tool usage", "run share", "tool error rate"],
    fields: [
      { name: "subject_id" }, { name: "tool_name" }, { name: "calls" }, { name: "runs_using_tool" },
      { name: "run_share" }, { name: "results" }, { name: "error_results" }, { name: "error_rate" },
    ],
    related: ["schema-trajectory-subject", "schema-trajectory-run"],
  },
  {
    id: "schema-trajectory-run",
    kind: "Artifact",
    name: "trajectory_run_metrics.csv",
    summary: "Run-level trajectory metrics used for tool-call scatter and detailed run inspection.",
    sourceStatus: "observed-export",
    sourceLabel: "Observed export",
    sourceNote: observedCurrent,
    aliases: ["run metrics", "tool calls per run", "repeated calls"],
    fields: [
      { name: "run_index" }, { name: "logical_run_id" }, { name: "run_id" }, { name: "subject_id" }, { name: "scenario_id" },
      { name: "repetition" }, { name: "tool_calls" }, { name: "distinct_tools" }, { name: "tool_results" }, { name: "error_results" },
      { name: "error_rate" }, { name: "repeated_calls" }, { name: "consecutive_repeated_calls" }, { name: "unmatched_calls" },
      { name: "unmatched_results" },
    ],
    related: ["schema-trajectory-subject", "schema-trajectory-tool"],
  },
];


interface GeneratedCatalogSource
{
  id: string;
  label: string;
  commit: string | null;
  schemaCount: number;
  fieldCount: number;
  packageCount?: number;
  packageDocumentCount?: number;
  packageFieldCount?: number;
}

interface GeneratedCatalogSchema
{
  id: string;
  sourceId: string;
  sourceLabel: string;
  relativePath: string;
  title: string;
  description: string | null;
  schemaUri: string | null;
  schemaId: string | null;
  types: string[];
  fileSha256: string;
  fieldCount: number;
  definitionCount: number;
}

interface GeneratedCatalogField
{
  id: string;
  schemaId: string;
  sourceId: string;
  sourceLabel: string;
  sourceRelativePath: string;
  name: string;
  path: string;
  pointer: string;
  title: string | null;
  description: string | null;
  types: string[];
  required: boolean;
  conditional: boolean;
  default?: unknown;
  enum: unknown[] | null;
  const?: unknown;
  format: string | null;
  ref: string | null;
  constraints: Record<string, unknown>;
}

interface GeneratedCatalogPackage
{
  id: string;
  sourceId: string;
  sourceLabel: string;
  relativeRoot: string;
  label: string;
  documentIds: string[];
  documentCount: number;
  fieldCount: number;
}

interface GeneratedCatalogPackageDocument
{
  id: string;
  packageId: string;
  sourceId: string;
  sourceLabel: string;
  relativeRoot: string;
  relativePath: string;
  fileName: string;
  fileSha256: string;
  topLevelKeys: string[];
  fieldCount: number;
}

interface GeneratedCatalogPackageField
{
  id: string;
  documentId: string;
  packageId: string;
  sourceId: string;
  sourceLabel: string;
  sourceRelativePath: string;
  name: string;
  path: string;
  types: string[];
}

interface GeneratedCatalog
{
  schemaVersion: string;
  generatedAt: string | null;
  sources: GeneratedCatalogSource[];
  schemas: GeneratedCatalogSchema[];
  fields: GeneratedCatalogField[];
  packages?: GeneratedCatalogPackage[];
  packageDocuments?: GeneratedCatalogPackageDocument[];
  packageFields?: GeneratedCatalogPackageField[];
}

const generatedCatalog = generatedSchemaCatalog as GeneratedCatalog;
const generatedSchemaEntryId = (schemaId: string) => `generated-schema:${schemaId}`;
const generatedFieldEntryId = (fieldId: string) => `generated-field:${fieldId}`;
const generatedPackageEntryId = (packageId: string) => `generated-package:${packageId}`;
const generatedPackageDocumentEntryId = (documentId: string) => `generated-package-yaml:${documentId}`;
const generatedPackageFieldEntryId = (fieldId: string) => `generated-package-field:${fieldId}`;
const generatedPackages = generatedCatalog.packages ?? [];
const generatedPackageDocuments = generatedCatalog.packageDocuments ?? [];
const generatedPackageFields = generatedCatalog.packageFields ?? [];

function displayValue(value: unknown)
{
  if (typeof value === "string")
  {
    return value;
  }
  const serialized = JSON.stringify(value);
  return serialized ?? String(value);
}

function generatedSourceNote(sourceId: string)
{
  const source = generatedCatalog.sources.find((candidate) => candidate.id === sourceId);
  if (!source)
  {
    return "Generated from a read-only ACMM source repository by the local reference importer.";
  }
  const commit = source.commit ? source.commit : "commit unavailable";
  return `Generated from the read-only ${source.label} repository at ${commit}.`;
}

const fieldsBySchema = new Map<string, GeneratedCatalogField[]>();
for (const field of generatedCatalog.fields)
{
  const list = fieldsBySchema.get(field.schemaId) ?? [];
  list.push(field);
  fieldsBySchema.set(field.schemaId, list);
}

function sourceNavigationRoot(sourceId: string)
{
  return sourceId === "experiments" ? "Experiments" : "Project reference";
}

function directorySegments(relativePath: string)
{
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  return segments.slice(0, -1);
}

const generatedSchemaEntries: ReferenceEntry[] = generatedCatalog.schemas.map((schema) =>
{
  const fields = fieldsBySchema.get(schema.id) ?? [];
  return {
    id: generatedSchemaEntryId(schema.id),
    kind: "Schema",
    name: schema.title,
    summary: schema.description ?? `JSON Schema imported from ${schema.sourceLabel}: ${schema.relativePath}`,
    sourceStatus: "generated-schema",
    sourceLabel: `${schema.sourceLabel} schema`,
    sourceNote: generatedSourceNote(schema.sourceId),
    aliases: [schema.relativePath, schema.schemaId ?? "", schema.fileSha256].filter((value) => value.length > 0),
    fields: fields.map((field) => ({
      name: field.path,
      description: field.description ?? `${field.types.length > 0 ? field.types.join(" | ") : "schema field"}${field.required ? "; required" : ""}`,
      entryId: generatedFieldEntryId(field.id),
    })),
    metadata: [
      { label: "Source repository", value: schema.sourceLabel },
      { label: "Source file", value: schema.relativePath },
      ...(schema.schemaId ? [{ label: "Schema $id", value: schema.schemaId }] : []),
      ...(schema.schemaUri ? [{ label: "JSON Schema dialect", value: schema.schemaUri }] : []),
      { label: "Fields", value: String(schema.fieldCount) },
      { label: "Definitions", value: String(schema.definitionCount) },
      { label: "File SHA-256", value: schema.fileSha256 },
    ],
    navigationGroup: [sourceNavigationRoot(schema.sourceId), "JSON Schemas", schema.sourceLabel, ...directorySegments(schema.relativePath)],
  };
});

const generatedFieldEntries: ReferenceEntry[] = generatedCatalog.fields.map((field) =>
{
  const schema = generatedCatalog.schemas.find((candidate) => candidate.id === field.schemaId);
  const requiredLabel = field.conditional ? "Conditional" : field.required ? "Yes" : "No";
  const metadata: ReferenceMetadata[] = [
    { label: "Canonical path", value: field.path },
    { label: "Type", value: field.types.length > 0 ? field.types.join(" | ") : "unspecified" },
    { label: "Required", value: requiredLabel },
    { label: "JSON pointer", value: field.pointer },
    { label: "Source file", value: field.sourceRelativePath },
  ];

  if (field.default !== undefined)
  {
    metadata.push({ label: "Default", value: displayValue(field.default) });
  }
  if (field.const !== undefined)
  {
    metadata.push({ label: "Const", value: displayValue(field.const) });
  }
  if (field.enum && field.enum.length > 0)
  {
    metadata.push({ label: "Allowed values", value: field.enum.map(displayValue).join(", ") });
  }
  if (field.format)
  {
    metadata.push({ label: "Format", value: field.format });
  }
  if (field.ref)
  {
    metadata.push({ label: "$ref", value: field.ref });
  }
  for (const [key, value] of Object.entries(field.constraints))
  {
    metadata.push({ label: key, value: displayValue(value) });
  }

  return {
    id: generatedFieldEntryId(field.id),
    kind: "Field",
    name: field.path,
    summary: field.description ?? field.title ?? `Field defined by ${schema?.title ?? field.schemaId}.`,
    sourceStatus: "generated-schema",
    sourceLabel: `${field.sourceLabel} field`,
    sourceNote: generatedSourceNote(field.sourceId),
    aliases: [field.name, field.path, field.pointer, field.sourceRelativePath, schema?.title ?? ""].filter((value) => value.length > 0),
    metadata,
    related: [generatedSchemaEntryId(field.schemaId)],
    navigationParentId: generatedSchemaEntryId(field.schemaId),
  };
});

const packageDocumentsByPackage = new Map<string, GeneratedCatalogPackageDocument[]>();
for (const document of generatedPackageDocuments)
{
  const list = packageDocumentsByPackage.get(document.packageId) ?? [];
  list.push(document);
  packageDocumentsByPackage.set(document.packageId, list);
}

const packageFieldsByDocument = new Map<string, GeneratedCatalogPackageField[]>();
for (const field of generatedPackageFields)
{
  const list = packageFieldsByDocument.get(field.documentId) ?? [];
  list.push(field);
  packageFieldsByDocument.set(field.documentId, list);
}

const generatedPackageEntries: ReferenceEntry[] = generatedPackages.map((packageRecord) =>
{
  const documents = packageDocumentsByPackage.get(packageRecord.id) ?? [];
  return {
    id: generatedPackageEntryId(packageRecord.id),
    kind: "Package",
    name: packageRecord.label,
    summary: `Experiment package source imported from ${packageRecord.relativeRoot}.`,
    sourceStatus: "generated-package",
    sourceLabel: `${packageRecord.sourceLabel} package`,
    sourceNote: generatedSourceNote(packageRecord.sourceId),
    aliases: [packageRecord.relativeRoot, packageRecord.label],
    metadata: [
      { label: "Source repository", value: packageRecord.sourceLabel },
      { label: "Package root", value: packageRecord.relativeRoot },
      { label: "Package YAML files", value: String(packageRecord.documentCount) },
      { label: "Observed package fields", value: String(packageRecord.fieldCount) },
    ],
    related: documents.map((document) => generatedPackageDocumentEntryId(document.id)),
    navigationGroup: ["Experiments", "Packages"],
  };
});

const generatedPackageDocumentEntries: ReferenceEntry[] = generatedPackageDocuments.map((document) =>
{
  const packageRecord = generatedPackages.find((candidate) => candidate.id === document.packageId);
  const fields = packageFieldsByDocument.get(document.id) ?? [];
  return {
    id: generatedPackageDocumentEntryId(document.id),
    kind: "Yaml",
    name: document.fileName,
    summary: `Experiment package YAML source file from ${document.relativePath}.`,
    sourceStatus: "generated-package",
    sourceLabel: `${document.sourceLabel} package YAML`,
    sourceNote: generatedSourceNote(document.sourceId),
    aliases: [document.relativePath, document.fileName, packageRecord?.label ?? "", ...document.topLevelKeys],
    fields: fields.map((field) => ({
      name: field.path,
      description: field.types.length > 0 ? field.types.join(" | ") : "observed package field",
      entryId: generatedPackageFieldEntryId(field.id),
    })),
    metadata: [
      { label: "Source repository", value: document.sourceLabel },
      { label: "Experiment package", value: packageRecord?.label ?? document.relativeRoot },
      { label: "Source file", value: document.relativePath },
      { label: "Fields", value: String(document.fieldCount) },
      { label: "File SHA-256", value: document.fileSha256 },
    ],
    related: [generatedPackageEntryId(document.packageId)],
    navigationParentId: generatedPackageEntryId(document.packageId),
  };
});

const generatedPackageFieldEntries: ReferenceEntry[] = generatedPackageFields.map((field) =>
{
  const document = generatedPackageDocuments.find((candidate) => candidate.id === field.documentId);
  const packageRecord = generatedPackages.find((candidate) => candidate.id === field.packageId);
  return {
    id: generatedPackageFieldEntryId(field.id),
    kind: "Field",
    name: field.path,
    summary: `Observed source field in ${document?.fileName ?? field.sourceRelativePath}.`,
    sourceStatus: "generated-package",
    sourceLabel: `${field.sourceLabel} package field`,
    sourceNote: generatedSourceNote(field.sourceId),
    aliases: [field.name, field.path, field.sourceRelativePath, packageRecord?.label ?? ""],
    metadata: [
      { label: "YAML path", value: field.path },
      { label: "Type", value: field.types.length > 0 ? field.types.join(" | ") : "unspecified" },
      { label: "Experiment package", value: packageRecord?.label ?? field.packageId },
      { label: "Source file", value: field.sourceRelativePath },
    ],
    related: [generatedPackageDocumentEntryId(field.documentId), generatedPackageEntryId(field.packageId)],
    navigationParentId: generatedPackageDocumentEntryId(field.documentId),
  };
});

export const schemaCatalogInfo = {
  schemaVersion: generatedCatalog.schemaVersion,
  generatedAt: generatedCatalog.generatedAt,
  sources: generatedCatalog.sources,
  schemaCount: generatedCatalog.schemas.length,
  fieldCount: generatedCatalog.fields.length,
  packageCount: generatedPackages.length,
  packageDocumentCount: generatedPackageDocuments.length,
  packageFieldCount: generatedPackageFields.length,
};

function curatedNavigationGroup(entry: ReferenceEntry)
{
  if (entry.kind === "Artifact")
  {
    return ["Experiments", "Export / analysis artifacts"];
  }
  if (entry.kind === "Command")
  {
    return ["Project reference", "Commands"];
  }
  if (entry.kind === "Concept")
  {
    return entry.sourceStatus === "explorer-local" ? ["Explorer", "Concepts"] : ["Project reference", "Concepts"];
  }
  return ["Project reference", "Other"];
}

function observedFieldEntryId(parentId: string, index: number)
{
  return `observed-field:${parentId}:${index}`;
}

const observedFieldEntries: ReferenceEntry[] = [];
const curatedEntriesWithFieldLinks: ReferenceEntry[] = curatedReferenceEntries.map((sourceEntry) =>
{
  const entry: ReferenceEntry = { ...sourceEntry, navigationGroup: curatedNavigationGroup(sourceEntry) };
  if (entry.kind !== "Artifact" || !entry.fields || entry.fields.length === 0)
  {
    return entry;
  }

  const linkedFields = entry.fields.map((field, index) =>
  {
    const fieldId = observedFieldEntryId(entry.id, index);
    observedFieldEntries.push({
      id: fieldId,
      kind: "Field",
      name: field.name,
      summary: field.description ?? `Observed field in ${entry.name}.`,
      sourceStatus: entry.sourceStatus,
      sourceLabel: `${entry.sourceLabel} field`,
      sourceNote: entry.sourceNote,
      aliases: [field.name, entry.name, ...(entry.aliases ?? [])],
      metadata: [
        { label: "Field", value: field.name },
        { label: "Observed artifact", value: entry.name },
      ],
      related: [entry.id],
      navigationParentId: entry.id,
    });
    return { ...field, entryId: fieldId };
  });

  return { ...entry, fields: linkedFields };
});

export const referenceEntries: ReferenceEntry[] = [
  ...curatedEntriesWithFieldLinks,
  ...observedFieldEntries,
  ...generatedSchemaEntries,
  ...generatedFieldEntries,
  ...generatedPackageEntries,
  ...generatedPackageDocumentEntries,
  ...generatedPackageFieldEntries,
];

export const referenceEntryById = new Map(referenceEntries.map((entry) => [entry.id, entry]));
