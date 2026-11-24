import type {
  DecisionEligibilityRule,
  DecisionFunctionDefinition,
  DecisionEvidenceMode,
  DecisionParameterControl,
  DecisionParameterDefinition,
  DecisionParameterGroupDefinition,
  DecisionParameterGroupPolicy,
} from "./model";
import { decisionFunctionPresets } from "./presets";

const storageKey = "acmm-explorer-decision-functions-v1";

function finiteOrNull(value: unknown): number | null
{
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeParameterGroups(value: unknown): DecisionParameterGroupDefinition[]
{
  if (!Array.isArray(value))
  {
    return [];
  }

  return value.flatMap((item): DecisionParameterGroupDefinition[] =>
  {
    if (typeof item !== "object" || item === null)
    {
      return [];
    }

    const candidate = item as Partial<DecisionParameterGroupDefinition>;
    if (typeof candidate.id !== "string" || typeof candidate.label !== "string")
    {
      return [];
    }

    const policy: DecisionParameterGroupPolicy = candidate.policy === "sum-to-one" ? "sum-to-one" : "none";
    return [{ id: candidate.id.toLowerCase(), label: candidate.label, policy }];
  });
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
      groupId: typeof candidate.groupId === "string" && candidate.groupId.trim().length > 0 ? candidate.groupId.toLowerCase() : null,
    }];
  });
}

function normalizeRules(value: unknown): DecisionEligibilityRule[]
{
  if (!Array.isArray(value))
  {
    return [];
  }
  const metrics = new Set(["goal", "obligation", "boundary", "procedure", "fidelity", "recovery", "availability"]);
  const operators = new Set([">=", ">", "<=", "<"]);
  return value.flatMap((item): DecisionEligibilityRule[] =>
  {
    if (typeof item !== "object" || item === null)
    {
      return [];
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
      return [];
    }
    return [{
      id: candidate.id,
      metric: metric as DecisionEligibilityRule["metric"],
      operator: candidate.operator as DecisionEligibilityRule["operator"],
      threshold: candidate.threshold,
    }];
  });
}

function normalizeEvidenceMode(value: unknown): DecisionEvidenceMode
{
  return value === "lower-confidence-bound" ? "lower-confidence-bound" : "point-estimate";
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

      const parameterGroups = normalizeParameterGroups(candidate.parameterGroups);
      const groupIds = new Set(parameterGroups.map((group) => group.id));
      const parameters = normalizeParameters(candidate.parameters).map((parameter) => ({
        ...parameter,
        groupId: parameter.groupId !== null && groupIds.has(parameter.groupId) ? parameter.groupId : null,
      }));

      return [{
        id: candidate.id,
        name: candidate.name,
        description: candidate.description,
        category: typeof candidate.category === "string" && candidate.category.trim().length > 0 ? candidate.category : "Custom",
        evidenceMode: normalizeEvidenceMode(candidate.evidenceMode),
        expression: candidate.expression,
        parameterGroups,
        parameters,
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
    evidenceMode: source?.evidenceMode ?? "point-estimate",
    expression: source?.expression ?? decisionFunctionPresets[0].expression,
    parameterGroups: source?.parameterGroups.map((item) => ({ ...item })) ?? [],
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
    parameterGroups: definition.parameterGroups.map((item) => ({ ...item })),
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
