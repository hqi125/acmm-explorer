import type {
  DecisionEligibilityRule,
  DecisionFunctionDefinition,
  DecisionParameterControl,
  DecisionParameterDefinition,
} from "./model";
import { decisionFunctionPresets } from "./presets";

const storageKey = "acmm-explorer-decision-functions-v1";

function finiteOrNull(value: unknown): number | null
{
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeParameters(value: unknown): DecisionParameterDefinition[]
{
  if (!Array.isArray(value))
  {
    return [];
  }
  return value.flatMap((item): DecisionParameterDefinition[] =>
  {
    if (typeof item !== "object" || item === null)
    {
      return [];
    }
    const candidate = item as Partial<DecisionParameterDefinition>;
    if (typeof candidate.id !== "string"
      || typeof candidate.label !== "string"
      || typeof candidate.value !== "number"
      || !Number.isFinite(candidate.value))
    {
      return [];
    }

    const control: DecisionParameterControl = candidate.control === "slider" ? "slider" : "number";
    return [{
      id: candidate.id,
      label: candidate.label,
      value: candidate.value,
      min: finiteOrNull(candidate.min),
      max: finiteOrNull(candidate.max),
      step: finiteOrNull(candidate.step),
      control,
    }];
  });
}

function normalizeRules(value: unknown): DecisionEligibilityRule[]
{
  if (!Array.isArray(value))
  {
    return [];
  }
  const dimensions = new Set(["goal", "obligation", "boundary", "procedure", "fidelity", "recovery"]);
  const operators = new Set([">=", ">", "<=", "<"]);
  return value.filter((item): item is DecisionEligibilityRule =>
  {
    if (typeof item !== "object" || item === null)
    {
      return false;
    }
    const candidate = item as Partial<DecisionEligibilityRule>;
    return typeof candidate.id === "string"
      && typeof candidate.dimension === "string"
      && dimensions.has(candidate.dimension)
      && typeof candidate.operator === "string"
      && operators.has(candidate.operator)
      && typeof candidate.threshold === "number"
      && Number.isFinite(candidate.threshold);
  });
}

function readCustomFunctions(): DecisionFunctionDefinition[]
{
  try
  {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null)
    {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed))
    {
      return [];
    }

    return parsed.flatMap((item): DecisionFunctionDefinition[] =>
    {
      if (typeof item !== "object" || item === null)
      {
        return [];
      }

      const candidate = item as Partial<DecisionFunctionDefinition>;
      if (candidate.source !== "custom"
        || typeof candidate.id !== "string"
        || typeof candidate.name !== "string"
        || typeof candidate.description !== "string"
        || typeof candidate.expression !== "string")
      {
        return [];
      }

      return [{
        id: candidate.id,
        name: candidate.name,
        description: candidate.description,
        category: typeof candidate.category === "string" && candidate.category.trim().length > 0 ? candidate.category : "Custom",
        expression: candidate.expression,
        parameters: normalizeParameters(candidate.parameters),
        eligibilityRules: normalizeRules(candidate.eligibilityRules),
        source: "custom",
        createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : null,
        updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
      }];
    });
  }
  catch
  {
    return [];
  }
}

function writeCustomFunctions(functions: DecisionFunctionDefinition[]): void
{
  window.localStorage.setItem(storageKey, JSON.stringify(functions));
}

export function listDecisionFunctions(): DecisionFunctionDefinition[]
{
  return [...decisionFunctionPresets, ...readCustomFunctions()];
}

export function createCustomDecisionFunction(source?: DecisionFunctionDefinition): DecisionFunctionDefinition
{
  const now = new Date().toISOString();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: `custom-${suffix}`,
    name: source === undefined ? "Untitled decision function" : `${source.name} copy`,
    description: source?.description ?? "Custom decision function.",
    category: "Custom",
    expression: source?.expression ?? decisionFunctionPresets[0].expression,
    parameters: source?.parameters.map((item) => ({ ...item })) ?? [],
    eligibilityRules: source?.eligibilityRules.map((item) => ({ ...item, id: `${item.id}-${suffix}` })) ?? [],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
}

export function saveDecisionFunction(definition: DecisionFunctionDefinition): DecisionFunctionDefinition
{
  if (definition.source !== "custom")
  {
    throw new Error("Preset decision functions are read-only. Duplicate a preset before editing it.");
  }

  const custom = readCustomFunctions();
  const now = new Date().toISOString();
  const next: DecisionFunctionDefinition = {
    ...definition,
    category: definition.category.trim().length > 0 ? definition.category.trim() : "Custom",
    parameters: definition.parameters.map((item) => ({ ...item })),
    eligibilityRules: definition.eligibilityRules.map((item) => ({ ...item })),
    updatedAt: now,
    createdAt: definition.createdAt ?? now,
  };
  const index = custom.findIndex((item) => item.id === definition.id);
  if (index >= 0)
  {
    custom[index] = next;
  }
  else
  {
    custom.push(next);
  }
  writeCustomFunctions(custom);
  return next;
}

export function deleteDecisionFunction(id: string): void
{
  const custom = readCustomFunctions().filter((item) => item.id !== id);
  writeCustomFunctions(custom);
}
