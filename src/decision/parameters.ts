import type { DecisionParameters } from "./expression";
import type { DecisionFunctionDefinition } from "./model";

export function rawDecisionParameters(definition: DecisionFunctionDefinition): DecisionParameters
{
  return Object.fromEntries(definition.parameters.map((item) => [item.id.toLowerCase(), item.value]));
}

export function effectiveDecisionParameters(
  definition: DecisionFunctionDefinition,
  rawOverrides: DecisionParameters = {},
): DecisionParameters
{
  const raw = { ...rawDecisionParameters(definition), ...rawOverrides };
  const effective: DecisionParameters = { ...raw };

  for (const group of definition.parameterGroups)
  {
    if (group.policy !== "sum-to-one")
    {
      continue;
    }

    const members = definition.parameters.filter(
      (parameter) => parameter.groupId?.toLowerCase() === group.id.toLowerCase(),
    );
    if (members.length === 0)
    {
      continue;
    }

    const total = members.reduce((sum, parameter) => sum + raw[parameter.id.toLowerCase()], 0);
    if (!Number.isFinite(total) || Math.abs(total) < 1e-12)
    {
      throw new Error(`Parameter group '${group.label}' cannot normalize because its raw sum is zero.`);
    }

    for (const parameter of members)
    {
      const id = parameter.id.toLowerCase();
      effective[id] = raw[id] / total;
    }
  }

  return effective;
}
