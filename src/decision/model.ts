export type DecisionDimension = "goal" | "obligation" | "boundary" | "procedure" | "fidelity" | "recovery";

export type EligibilityOperator = ">=" | ">" | "<=" | "<";

export type DecisionParameterControl = "number" | "slider";

export interface DecisionParameterDefinition
{
  id: string;
  label: string;
  value: number;
  min: number | null;
  max: number | null;
  step: number | null;
  control: DecisionParameterControl;
}

export interface DecisionEligibilityRule
{
  id: string;
  dimension: DecisionDimension;
  operator: EligibilityOperator;
  threshold: number;
}

export interface DecisionFunctionDefinition
{
  id: string;
  name: string;
  description: string;
  category: string;
  expression: string;
  parameters: DecisionParameterDefinition[];
  eligibilityRules: DecisionEligibilityRule[];
  source: "preset" | "custom";
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DecisionEvaluation
{
  subjectId: string;
  value: number | null;
  eligible: boolean | null;
  failedRules: string[];
  error: string | null;
}
