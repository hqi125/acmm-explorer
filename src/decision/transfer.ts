import type {
  DecisionEligibilityRule,
  DecisionFunctionDefinition,
  DecisionParameterControl,
  DecisionParameterDefinition,
} from "./model";
import { createCustomDecisionFunction } from "./store";

export const decisionRecipeSchema = "acmm-explorer-decision-recipe/0.1";

interface DecisionRecipeFile
{
  schema: string;
  exportedAt: string;
  recipe: {
    name: string;
    description: string;
    category: string;
    expression: string;
    parameters: DecisionParameterDefinition[];
    eligibilityRules: DecisionEligibilityRule[];
  };
}

function finiteOrNull(value: unknown): number | null
{
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readParameters(value: unknown): DecisionParameterDefinition[]
{
  if (!Array.isArray(value))
  {
    throw new Error("Recipe parameters must be an array.");
  }

  return value.map((item, index) =>
  {
    if (typeof item !== "object" || item === null)
    {
      throw new Error(`Parameter ${index + 1} is not an object.`);
    }
    const candidate = item as Partial<DecisionParameterDefinition>;
    if (typeof candidate.id !== "string"
      || typeof candidate.label !== "string"
      || typeof candidate.value !== "number"
      || !Number.isFinite(candidate.value))
    {
      throw new Error(`Parameter ${index + 1} is missing a valid id, label, or numeric value.`);
    }
    const control: DecisionParameterControl = candidate.control === "slider" ? "slider" : "number";
    return {
      id: candidate.id,
      label: candidate.label,
      value: candidate.value,
      min: finiteOrNull(candidate.min),
      max: finiteOrNull(candidate.max),
      step: finiteOrNull(candidate.step),
      control,
    };
  });
}

function readRules(value: unknown): DecisionEligibilityRule[]
{
  if (!Array.isArray(value))
  {
    throw new Error("Recipe eligibilityRules must be an array.");
  }
  const dimensions = new Set(["goal", "obligation", "boundary", "procedure", "fidelity", "recovery"]);
  const operators = new Set([">=", ">", "<=", "<"]);

  return value.map((item, index) =>
  {
    if (typeof item !== "object" || item === null)
    {
      throw new Error(`Eligibility rule ${index + 1} is not an object.`);
    }
    const candidate = item as Partial<DecisionEligibilityRule>;
    if (typeof candidate.id !== "string"
      || typeof candidate.dimension !== "string"
      || !dimensions.has(candidate.dimension)
      || typeof candidate.operator !== "string"
      || !operators.has(candidate.operator)
      || typeof candidate.threshold !== "number"
      || !Number.isFinite(candidate.threshold))
    {
      throw new Error(`Eligibility rule ${index + 1} is invalid.`);
    }
    return candidate as DecisionEligibilityRule;
  });
}

export function serializeDecisionRecipe(definition: DecisionFunctionDefinition): string
{
  const payload: DecisionRecipeFile = {
    schema: decisionRecipeSchema,
    exportedAt: new Date().toISOString(),
    recipe: {
      name: definition.name,
      description: definition.description,
      category: definition.category,
      expression: definition.expression,
      parameters: definition.parameters.map((item) => ({ ...item })),
      eligibilityRules: definition.eligibilityRules.map((item) => ({ ...item })),
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function parseDecisionRecipe(text: string): DecisionFunctionDefinition
{
  let parsed: unknown;
  try
  {
    parsed = JSON.parse(text) as unknown;
  }
  catch
  {
    throw new Error("The selected file is not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null)
  {
    throw new Error("The selected file is not a decision recipe object.");
  }
  const file = parsed as Partial<DecisionRecipeFile>;
  if (file.schema !== decisionRecipeSchema)
  {
    throw new Error(`Unsupported decision recipe schema '${String(file.schema ?? "missing")}'.`);
  }
  if (typeof file.recipe !== "object" || file.recipe === null)
  {
    throw new Error("The decision recipe payload is missing.");
  }

  const recipe = file.recipe as Partial<DecisionRecipeFile["recipe"]>;
  if (typeof recipe.name !== "string"
    || typeof recipe.description !== "string"
    || typeof recipe.expression !== "string")
  {
    throw new Error("The decision recipe is missing name, description, or expression fields.");
  }

  const imported = createCustomDecisionFunction();
  return {
    ...imported,
    name: recipe.name.trim().length > 0 ? `${recipe.name} import` : "Imported decision function",
    description: recipe.description,
    category: typeof recipe.category === "string" && recipe.category.trim().length > 0 ? recipe.category : "Imported",
    expression: recipe.expression,
    parameters: readParameters(recipe.parameters ?? []),
    eligibilityRules: readRules(recipe.eligibilityRules ?? []),
  };
}

export function decisionRecipeFileName(definition: DecisionFunctionDefinition): string
{
  const base = definition.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "decision-recipe";
  return `${base}.acmm-decision.json`;
}
