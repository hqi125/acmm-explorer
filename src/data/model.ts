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

export interface RequirementEstimate
{
  estimand: string;
  subjectId: string;
  requirementId: string;
  dimension: ComplianceDimension;
  compliant: number | null;
  violation: number | null;
  unadjudicable: number | null;
  notApplicable: number | null;
  adjudicable: number | null;
  applicable: number | null;
  score: number | null;
  coverage: number | null;
  lower: number | null;
  upper: number | null;
  intervalStatus: string | null;
  sourcePath: string;
  intervalSourcePath: string | null;
}

export interface AvailabilityScenario
{
  subjectId: string;
  scenarioId: string;
  plannedSlots: number | null;
  availableValidSlots: number | null;
  unavailableSlots: number | null;
  availability: number | null;
  firstAttemptAvailability: number | null;
  retriedSlots: number | null;
  recoveredByRetrySlots: number | null;
  sourcePath: string;
}

export interface AvailabilityInterval
{
  subjectId: string;
  plannedSlots: number | null;
  scenarioClusters: number | null;
  availability: number | null;
  confidenceLevel: number | null;
  lower: number | null;
  upper: number | null;
  intervalStatus: string;
  sourcePath: string;
}

export interface AvailabilityFailureMode
{
  subjectId: string | null;
  finalTermination: string;
  failureKind: string;
  unavailableSlots: number | null;
  fractionUnavailable: number | null;
  fractionPlanned: number | null;
  sourcePath: string;
}

export interface TrajectorySubjectSummary
{
  subjectId: string;
  selectedRuns: number | null;
  totalToolCalls: number | null;
  meanToolCallsPerRun: number | null;
  medianToolCallsPerRun: number | null;
  totalDistinctToolNames: number | null;
  meanDistinctToolsPerRun: number | null;
  totalToolResults: number | null;
  errorResults: number | null;
  errorRate: number | null;
  repeatedCalls: number | null;
  consecutiveRepeatedCalls: number | null;
  unmatchedCalls: number | null;
  unmatchedResults: number | null;
  sourcePath: string;
}

export interface TrajectoryToolUsage
{
  subjectId: string;
  toolName: string;
  calls: number | null;
  runsUsingTool: number | null;
  runShare: number | null;
  results: number | null;
  errorResults: number | null;
  errorRate: number | null;
  sourcePath: string;
}

export interface TrajectoryRunMetric
{
  runIndex: number | null;
  logicalRunId: string;
  runId: string;
  subjectId: string;
  scenarioId: string;
  repetition: number | null;
  toolCalls: number | null;
  distinctTools: number | null;
  toolResults: number | null;
  errorResults: number | null;
  errorRate: number | null;
  repeatedCalls: number | null;
  consecutiveRepeatedCalls: number | null;
  unmatchedCalls: number | null;
  unmatchedResults: number | null;
  sourcePath: string;
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
  requirements: RequirementEstimate[];
  availabilityScenarios: AvailabilityScenario[];
  availabilityIntervals: AvailabilityInterval[];
  availabilityFailureModes: AvailabilityFailureMode[];
  trajectorySummaries: TrajectorySubjectSummary[];
  trajectoryToolUsage: TrajectoryToolUsage[];
  trajectoryRunMetrics: TrajectoryRunMetric[];
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
