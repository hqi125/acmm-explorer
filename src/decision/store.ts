import type { DecisionFunctionDefinition } from "./model";
import { decisionFunctionPresets } from "./presets";

const storageKey = "acmm-explorer-decision-functions-v1";

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

    return parsed.filter((item): item is DecisionFunctionDefinition =>
    {
      if (typeof item !== "object" || item === null)
      {
        return false;
      }

      const candidate = item as Partial<DecisionFunctionDefinition>;
      return candidate.source === "custom"
        && typeof candidate.id === "string"
        && typeof candidate.name === "string"
        && typeof candidate.description === "string"
        && typeof candidate.expression === "string";
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
    expression: source?.expression ?? decisionFunctionPresets[0].expression,
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
}

export function saveDecisionFunction(definition: DecisionFunctionDefinition): void
{
  if (definition.source !== "custom")
  {
    throw new Error("Preset decision functions are read-only. Duplicate a preset before editing it.");
  }

  const custom = readCustomFunctions();
  const now = new Date().toISOString();
  const next: DecisionFunctionDefinition = {
    ...definition,
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
}

export function deleteDecisionFunction(id: string): void
{
  const custom = readCustomFunctions().filter((item) => item.id !== id);
  writeCustomFunctions(custom);
}
