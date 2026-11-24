import type { DecisionFunctionDefinition } from "./model";

export const decisionFunctionPresets: DecisionFunctionDefinition[] = [
  {
    id: "preset-equal-mean",
    name: "Equal arithmetic mean",
    description: "Treat all six compliance dimensions equally and average their point estimates.",
    expression: "(goal + obligation + boundary + procedure + fidelity + recovery) / 6",
    source: "preset",
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "preset-geometric-mean",
    name: "Equal geometric mean",
    description: "Reward balanced profiles and penalize a very low dimension more strongly than the arithmetic mean.",
    expression: "pow(max(goal, 0.000001) * max(obligation, 0.000001) * max(boundary, 0.000001) * max(procedure, 0.000001) * max(fidelity, 0.000001) * max(recovery, 0.000001), 1 / 6)",
    source: "preset",
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "preset-minimum-dimension",
    name: "Minimum dimension",
    description: "Use the weakest compliance dimension as the decision value.",
    expression: "min(goal, obligation, boundary, procedure, fidelity, recovery)",
    source: "preset",
    createdAt: null,
    updatedAt: null,
  },
];
