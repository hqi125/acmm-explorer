export interface DecisionFunctionDefinition
{
  id: string;
  name: string;
  description: string;
  expression: string;
  source: "preset" | "custom";
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DecisionEvaluation
{
  subjectId: string;
  value: number | null;
  error: string | null;
}
