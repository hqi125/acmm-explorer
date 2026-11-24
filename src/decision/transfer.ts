import type {
  DecisionEligibilityRule,
  DecisionEvidenceMode,
  DecisionFunctionDefinition,
  DecisionParameterControl,
  DecisionParameterDefinition,
  DecisionParameterGroupDefinition,
  DecisionParameterGroupPolicy,
} from "./model";
import { createCustomDecisionFunction } from "./store";

export const decisionRecipeSchema = "acmm-explorer-decision-recipe/0.3";
const supportedSchemas = new Set([
  decisionRecipeSchema,
  "acmm-explorer-decision-recipe/0.2",
  "acmm-explorer-decision-recipe/0.1",
]);

interface DecisionRecipeFile
{
  schema: string;
  exportedAt: string;
  recipe: {
    name: string;
    description: string;
    category: string;
    evidenceMode?: DecisionEvidenceMode;
    expression: string;
    parameterGroups?: DecisionParameterGroupDefinition[];
    parameters: DecisionParameterDefinition[];
    eligibilityRules: DecisionEligibilityRule[];
  };
}

function finiteOrNull(value: unknown): number | null
{
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readParameterGroups(value: unknown): DecisionParameterGroupDefinition[]
{
  if (value === undefined)
  {
    return [];
  }
  if (!Array.isArray(value))
  {
    throw new Error("Recipe parameterGroups must be an array.");
  }

  return value.map((item, index) =>
  {
    if (typeof item !== "object" || item === null)
    {
      throw new Error(`Parameter group ${index + 1} is not an object.`);
    }
    const candidate = item as Partial<DecisionParameterGroupDefinition>;
    if (typeof candidate.id !== "string" || typeof candidate.label !== "string")
    {
      throw new Error(`Parameter group ${index + 1} is missing a valid id or label.`);
    }
    const policy: DecisionParameterGroupPolicy = candidate.policy === "sum-to-one" ? "sum-to-one" : "none";
    return { id: candidate.id.toLowerCase(), label: candidate.label, policy };
  });
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
      groupId: typeof candidate.groupId === "string" && candidate.groupId.trim().length > 0 ? candidate.groupId.toLowerCase() : null,
    };
  });
}

function readRules(value: unknown): DecisionEligibilityRule[]
{
  if (!Array.isArray(value))
  {
    throw new Error("Recipe eligibilityRules must be an array.");
  }
  const metrics = new Set(["goal", "obligation", "boundary", "procedure", "fidelity", "recovery", "availability"]);
  const operators = new Set([">=", ">", "<=", "<"]);

  return value.map((item, index) =>
  {
    if (typeof item !== "object" || item === null)
    {
      throw new Error(`Eligibility rule ${index + 1} is not an object.`);
    }
    const candidate = item as Partial<DecisionEligibilityRule> & { dimension?: unknown };
    const metric = typeof candidate.metric === "string"
      ? candidate.metric
      : typeof candidate.dimension === "string"
        ? candidate.dimension
        : null;
    if (typeof candidate.id !== "string"
      || metric === null
      || !metrics.has(metric)
      || typeof candidate.operator !== "string"
      || !operators.has(candidate.operator)
      || typeof candidate.threshold !== "number"
      || !Number.isFinite(candidate.threshold))
    {
      throw new Error(`Eligibility rule ${index + 1} is invalid.`);
    }
    return {
      id: candidate.id,
      metric: metric as DecisionEligibilityRule["metric"],
      operator: candidate.operator as DecisionEligibilityRule["operator"],
      threshold: candidate.threshold,
    };
  });
}

function readEvidenceMode(value: unknown): DecisionEvidenceMode
{
  return value === "lower-confidence-bound" ? "lower-confidence-bound" : "point-estimate";
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
      evidenceMode: definition.evidenceMode,
      expression: definition.expression,
      parameterGroups: definition.parameterGroups.map((item) => ({ ...item })),
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
  if (typeof file.schema !== "string" || !supportedSchemas.has(file.schema))
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

  const parameterGroups = readParameterGroups(recipe.parameterGroups);
  const groupIds = new Set(parameterGroups.map((group) => group.id));
  const parameters = readParameters(recipe.parameters ?? []).map((parameter) => ({
    ...parameter,
    groupId: parameter.groupId !== null && groupIds.has(parameter.groupId) ? parameter.groupId : null,
  }));

  const imported = createCustomDecisionFunction();
  return {
    ...imported,
    name: recipe.name.trim().length > 0 ? `${recipe.name} import` : "Imported decision function",
    description: recipe.description,
    category: typeof recipe.category === "string" && recipe.category.trim().length > 0 ? recipe.category : "Imported",
    evidenceMode: readEvidenceMode(recipe.evidenceMode),
    expression: recipe.expression,
    parameterGroups,
    parameters,
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
