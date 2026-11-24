export const complianceDimensions = [
  "goal",
  "obligation",
  "boundary",
  "procedure",
  "fidelity",
  "recovery",
] as const;

export type ComplianceDimension = typeof complianceDimensions[number];

export interface ComplianceDimensionValue
{
  dimension: ComplianceDimension;
  score: number | null;
  lower: number | null;
  upper: number | null;
  totalRequirements: number | null;
  estimableRequirements: number | null;
  missingRequirements: number | null;
  aggregationStatus: string;
  sourcePath: string;
  intervalSourcePath: string | null;
}

export interface AgentProfile
{
  subjectId: string;
  dimensions: ComplianceDimensionValue[];
  availability: number | null;
  selectedRuns: number | null;
  totalToolCalls: number | null;
  meanToolCallsPerRun: number | null;
  toolErrorRate: number | null;
}

export interface AnalysisSnapshot
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
  subjects: string[];
  profiles: AgentProfile[];
  availableTables: string[];
}

export interface AcmmExportDataset
{
  adapterId: string;
  exportSchemaVersion: string;
  sourceKind: "run" | "campaign";
  experimentId: string;
  rootPath: string;
  executionId: string | null;
  campaignId: string | null;
  mergeId: string | null;
  packageSha256: string | null;
  contractSha256: string | null;
  analyses: AnalysisSnapshot[];
  defaultAnalysisId: string;
  warnings: string[];
}
