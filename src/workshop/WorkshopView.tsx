import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { AppView } from "../app/navigation";
import { complianceDimensions, type AnalysisSnapshot, type AgentProfile } from "../data/model";
import { useExportSession } from "../data/session/ExportSession";
import {
  evaluateDecisionExpression,
  isValidParameterId,
  validateDecisionExpression,
  type DecisionParameters,
  type DecisionVariables,
} from "../decision/expression";
import type {
  DecisionDimension,
  DecisionEligibilityMetric,
  DecisionEligibilityRule,
  DecisionEvidenceMode,
  DecisionEvaluation,
  DecisionFunctionDefinition,
  DecisionParameterControl,
  DecisionParameterDefinition,
  DecisionParameterGroupDefinition,
  DecisionParameterGroupPolicy,
  EligibilityOperator,
} from "../decision/model";
import {
  createCustomDecisionFunction,
  deleteDecisionFunction,
  listDecisionFunctions,
  saveDecisionFunction,
} from "../decision/store";
import { effectiveDecisionParameters } from "../decision/parameters";
import { detectDecisionSensitivityCrossings } from "../decision/sensitivity";
import { decisionRecipeFileName, parseDecisionRecipe, serializeDecisionRecipe } from "../decision/transfer";
import { ComplianceMultiRadar } from "../visualization/ComplianceMultiRadar";
import { DecisionScoreChart } from "../visualization/DecisionScoreChart";
import { DecisionRankComparisonChart, type DecisionRankComparisonRow } from "../visualization/DecisionRankComparisonChart";
import { DecisionSensitivityChart, type DecisionSensitivitySeries } from "../visualization/DecisionSensitivityChart";

interface WorkshopViewProps
{
  onNavigate: (view: AppView) => void;
}

const dimensionLabels: Record<DecisionDimension, string> = {
  goal: "Goal",
  obligation: "Obligation",
  boundary: "Boundary",
  procedure: "Procedure",
  fidelity: "Fidelity",
  recovery: "Recovery",
};

const eligibilityMetricLabels: Record<DecisionEligibilityMetric, string> = {
  ...dimensionLabels,
  availability: "Availability",
};

const evidenceModeLabels: Record<DecisionEvidenceMode, string> = {
  "point-estimate": "Point estimate",
  "lower-confidence-bound": "Lower confidence bound",
};

const eligibilityOperators: EligibilityOperator[] = [">=", ">", "<=", "<"];

function profileVariables(profile: AgentProfile, evidenceMode: DecisionEvidenceMode): DecisionVariables | null
{
  const values = new Map(profile.dimensions.map((item) => [
    item.dimension,
    evidenceMode === "lower-confidence-bound" ? item.lower : item.score,
  ]));
  const result = {} as DecisionVariables;
  for (const dimension of complianceDimensions)
  {
    const value = values.get(dimension) ?? null;
    if (value === null)
    {
      return null;
    }
    result[dimension] = value;
  }
  return result;
}

function formatParameterValue(value: number): string
{
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.0001))
  {
    return value.toExponential(4);
  }
  return Number(value.toFixed(6)).toString();
}

function rulePasses(rule: DecisionEligibilityRule, profile: AgentProfile, variables: DecisionVariables): boolean | null
{
  const value = rule.metric === "availability" ? profile.availability : variables[rule.metric];
  if (value === null)
  {
    return null;
  }
  switch (rule.operator)
  {
    case ">=":
      return value >= rule.threshold;
    case ">":
      return value > rule.threshold;
    case "<=":
      return value <= rule.threshold;
    case "<":
      return value < rule.threshold;
  }
}

function describeRule(rule: DecisionEligibilityRule): string
{
  return `${eligibilityMetricLabels[rule.metric]} ${rule.operator} ${rule.threshold}`;
}

function evaluateProfiles(analysis: AnalysisSnapshot, definition: DecisionFunctionDefinition): DecisionEvaluation[]
{
  const parameters = effectiveDecisionParameters(definition);
  return analysis.profiles.map((profile) =>
  {
    const variables = profileVariables(profile, definition.evidenceMode);
    if (variables === null)
    {
      return {
        subjectId: profile.subjectId,
        value: null,
        eligible: null,
        failedRules: [],
        error: definition.evidenceMode === "lower-confidence-bound"
          ? "One or more lower confidence bounds are unavailable."
          : "One or more compliance dimensions are unavailable.",
      };
    }

    const unavailableRules = definition.eligibilityRules
      .filter((rule) => rulePasses(rule, profile, variables) === null)
      .map(describeRule);
    if (unavailableRules.length > 0)
    {
      return {
        subjectId: profile.subjectId,
        value: null,
        eligible: null,
        failedRules: [],
        error: `Eligibility data unavailable for: ${unavailableRules.join("; ")}.`,
      };
    }

    const failedRules = definition.eligibilityRules
      .filter((rule) => rulePasses(rule, profile, variables) === false)
      .map(describeRule);

    try
    {
      return {
        subjectId: profile.subjectId,
        value: evaluateDecisionExpression(definition.expression, variables, parameters),
        eligible: failedRules.length === 0,
        failedRules,
        error: null,
      };
    }
    catch (error)
    {
      return {
        subjectId: profile.subjectId,
        value: null,
        eligible: null,
        failedRules,
        error: error instanceof Error ? error.message : "Evaluation failed.",
      };
    }
  }).sort((left, right) =>
  {
    const eligibilityOrder = (value: DecisionEvaluation): number => value.error !== null ? 2 : value.eligible === true ? 0 : 1;
    const order = eligibilityOrder(left) - eligibilityOrder(right);
    if (order !== 0)
    {
      return order;
    }
    if (left.value === null && right.value === null)
    {
      return left.subjectId.localeCompare(right.subjectId);
    }
    if (left.value === null)
    {
      return 1;
    }
    if (right.value === null)
    {
      return -1;
    }
    return right.value - left.value;
  });
}


function eligibleRankMap(evaluations: DecisionEvaluation[]): Map<string, number>
{
  const eligible = evaluations.filter((item) => item.eligible === true && item.value !== null);
  return new Map(eligible.map((item, index) => [item.subjectId, index + 1]));
}

function evaluationLabel(evaluation: DecisionEvaluation | undefined): string
{
  if (evaluation === undefined || evaluation.error !== null || evaluation.value === null)
  {
    return "Unavailable";
  }
  if (evaluation.eligible === false)
  {
    return "Ineligible";
  }
  return evaluation.value.toFixed(4);
}

function evaluateSensitivity(
  analysis: AnalysisSnapshot,
  definition: DecisionFunctionDefinition,
  parameter: DecisionParameterDefinition,
): DecisionSensitivitySeries[]
{
  const minimum = parameter.min;
  const maximum = parameter.max;
  if (minimum === null || maximum === null || maximum <= minimum)
  {
    return [];
  }

  const sampleCount = 41;
  const parameterId = parameter.id.toLowerCase();

  return analysis.profiles.flatMap((profile): DecisionSensitivitySeries[] =>
  {
    const variables = profileVariables(profile, definition.evidenceMode);
    if (variables === null || definition.eligibilityRules.some((rule) => rulePasses(rule, profile, variables) !== true))
    {
      return [];
    }

    const points: Array<[number, number | null]> = [];
    let numericPointCount = 0;
    for (let index = 0; index < sampleCount; index += 1)
    {
      const fraction = index / (sampleCount - 1);
      const parameterValue = minimum + (maximum - minimum) * fraction;
      try
      {
        const value = evaluateDecisionExpression(
          definition.expression,
          variables,
          effectiveDecisionParameters(definition, { [parameterId]: parameterValue }),
        );
        if (!Number.isFinite(value))
        {
          points.push([parameterValue, null]);
          continue;
        }
        numericPointCount += 1;
        points.push([parameterValue, value]);
      }
      catch
      {
        points.push([parameterValue, null]);
      }
    }

    return numericPointCount === 0 ? [] : [{ subjectId: profile.subjectId, points }];
  });
}

function validateRecipe(definition: DecisionFunctionDefinition): string | null
{
  if (definition.name.trim().length === 0)
  {
    return "Function name is required.";
  }

  const groupIds = new Set<string>();
  for (const group of definition.parameterGroups)
  {
    const id = group.id.toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/i.test(id))
    {
      return `Parameter group '${group.id}' must use a programming-style identifier.`;
    }
    if (groupIds.has(id))
    {
      return `Parameter group '${group.id}' is defined more than once.`;
    }
    if (group.label.trim().length === 0)
    {
      return `Parameter group '${group.id}' requires a label.`;
    }
    groupIds.add(id);
  }

  const ids = new Set<string>();
  for (const parameter of definition.parameters)
  {
    const id = parameter.id.toLowerCase();
    if (!isValidParameterId(id))
    {
      return `Parameter '${parameter.id}' must be a unique programming-style identifier and cannot use a reserved name.`;
    }
    if (ids.has(id))
    {
      return `Parameter '${parameter.id}' is defined more than once.`;
    }
    if (!Number.isFinite(parameter.value))
    {
      return `Parameter '${parameter.id}' must have a finite numeric value.`;
    }
    if (parameter.min !== null && !Number.isFinite(parameter.min))
    {
      return `Parameter '${parameter.id}' minimum must be finite or empty.`;
    }
    if (parameter.max !== null && !Number.isFinite(parameter.max))
    {
      return `Parameter '${parameter.id}' maximum must be finite or empty.`;
    }
    if (parameter.step !== null && (!Number.isFinite(parameter.step) || parameter.step <= 0))
    {
      return `Parameter '${parameter.id}' step must be a positive finite number or empty.`;
    }
    if (parameter.min !== null && parameter.max !== null && parameter.min > parameter.max)
    {
      return `Parameter '${parameter.id}' minimum cannot exceed its maximum.`;
    }
    if (parameter.min !== null && parameter.value < parameter.min)
    {
      return `Parameter '${parameter.id}' value is below its configured minimum.`;
    }
    if (parameter.max !== null && parameter.value > parameter.max)
    {
      return `Parameter '${parameter.id}' value is above its configured maximum.`;
    }
    if (parameter.control === "slider" && (parameter.min === null || parameter.max === null))
    {
      return `Slider parameter '${parameter.id}' requires both minimum and maximum values.`;
    }
    if (parameter.groupId !== null && !groupIds.has(parameter.groupId.toLowerCase()))
    {
      return `Parameter '${parameter.id}' references unknown group '${parameter.groupId}'.`;
    }
    ids.add(id);
  }

  for (const group of definition.parameterGroups)
  {
    if (group.policy !== "sum-to-one")
    {
      continue;
    }
    const members = definition.parameters.filter((parameter) => parameter.groupId?.toLowerCase() === group.id.toLowerCase());
    if (members.length === 0)
    {
      return `Sum-to-one group '${group.label}' must contain at least one parameter.`;
    }
    const total = members.reduce((sum, parameter) => sum + parameter.value, 0);
    if (Math.abs(total) < 1e-12)
    {
      return `Sum-to-one group '${group.label}' cannot have a raw total of zero.`;
    }
  }

  for (const rule of definition.eligibilityRules)
  {
    if (!Number.isFinite(rule.threshold))
    {
      return `${eligibilityMetricLabels[rule.metric]} eligibility threshold must be finite.`;
    }
  }

  try
  {
    return validateDecisionExpression(definition.expression, effectiveDecisionParameters(definition));
  }
  catch (error)
  {
    return error instanceof Error ? error.message : "Parameter normalization failed.";
  }
}

function cloneDefinition(definition: DecisionFunctionDefinition): DecisionFunctionDefinition
{
  return {
    ...definition,
    parameterGroups: definition.parameterGroups.map((item) => ({ ...item })),
    parameters: definition.parameters.map((item) => ({ ...item })),
    eligibilityRules: definition.eligibilityRules.map((item) => ({ ...item })),
  };
}

export function WorkshopView({ onNavigate }: WorkshopViewProps)
{
  const {
    dataset,
    selectedAnalysisId: analysisId,
    busy: loading,
    inspectionError,
    normalizationError,
    changeAnalysis,
  } = useExportSession();
  const loadError = inspectionError ?? normalizationError;
  const [functions, setFunctions] = useState<DecisionFunctionDefinition[]>(() => listDecisionFunctions());
  const [selectedFunctionId, setSelectedFunctionId] = useState("preset-equal-mean");
  const [draft, setDraft] = useState<DecisionFunctionDefinition | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [sensitivityParameterId, setSensitivityParameterId] = useState("");
  const [comparisonLeftId, setComparisonLeftId] = useState("preset-equal-mean");
  const [comparisonRightId, setComparisonRightId] = useState("");
  const recipeImportRef = useRef<HTMLInputElement>(null);

  const selectedFunction = useMemo(
    () => functions.find((item) => item.id === selectedFunctionId) ?? functions[0] ?? null,
    [functions, selectedFunctionId],
  );

  const presetCategories = useMemo(
    () => Array.from(new Set(functions.filter((item) => item.source === "preset").map((item) => item.category))),
    [functions],
  );

  useEffect(() =>
  {
    setDraft(selectedFunction === null ? null : cloneDefinition(selectedFunction));
    setIsEditing(false);
    setSaveMessage(null);
  }, [selectedFunction]);

  useEffect(() =>
  {
    if (selectedFunction === null)
    {
      return;
    }
    setComparisonLeftId(selectedFunction.id);
    setComparisonRightId((current) =>
    {
      if (current !== "" && current !== selectedFunction.id && functions.some((item) => item.id === current))
      {
        return current;
      }
      return functions.find((item) => item.id !== selectedFunction.id)?.id ?? selectedFunction.id;
    });
  }, [functions, selectedFunction]);

  useEffect(() =>
  {
    const bounded = selectedFunction?.parameters.filter((parameter) =>
      parameter.min !== null && parameter.max !== null && parameter.max > parameter.min) ?? [];
    setSensitivityParameterId((current) =>
      bounded.some((parameter) => parameter.id === current) ? current : bounded[0]?.id ?? "");
  }, [selectedFunction]);

  const activeAnalysis = useMemo(
    () => dataset?.analyses.find((analysis) => analysis.id === analysisId) ?? null,
    [analysisId, dataset],
  );

  const recipeError = draft === null ? "No decision function selected." : validateRecipe(draft);
  const evaluations = useMemo(
    () => activeAnalysis === null || selectedFunction === null || isEditing
      ? []
      : evaluateProfiles(activeAnalysis, selectedFunction),
    [activeAnalysis, isEditing, selectedFunction],
  );
  const comparisonLeftFunction = useMemo(
    () => functions.find((item) => item.id === comparisonLeftId) ?? null,
    [comparisonLeftId, functions],
  );
  const comparisonRightFunction = useMemo(
    () => functions.find((item) => item.id === comparisonRightId) ?? null,
    [comparisonRightId, functions],
  );
  const comparisonLeftEvaluations = useMemo(
    () => activeAnalysis === null || comparisonLeftFunction === null || isEditing
      ? []
      : evaluateProfiles(activeAnalysis, comparisonLeftFunction),
    [activeAnalysis, comparisonLeftFunction, isEditing],
  );
  const comparisonRightEvaluations = useMemo(
    () => activeAnalysis === null || comparisonRightFunction === null || isEditing
      ? []
      : evaluateProfiles(activeAnalysis, comparisonRightFunction),
    [activeAnalysis, comparisonRightFunction, isEditing],
  );
  const comparisonRows = useMemo(() =>
  {
    const leftRanks = eligibleRankMap(comparisonLeftEvaluations);
    const rightRanks = eligibleRankMap(comparisonRightEvaluations);
    const leftBySubject = new Map(comparisonLeftEvaluations.map((item) => [item.subjectId, item]));
    const rightBySubject = new Map(comparisonRightEvaluations.map((item) => [item.subjectId, item]));
    const subjectIds = Array.from(new Set([
      ...comparisonLeftEvaluations.map((item) => item.subjectId),
      ...comparisonRightEvaluations.map((item) => item.subjectId),
    ])).sort();
    return subjectIds.map((subjectId) => ({
      subjectId,
      leftEvaluation: leftBySubject.get(subjectId),
      rightEvaluation: rightBySubject.get(subjectId),
      leftRank: leftRanks.get(subjectId) ?? null,
      rightRank: rightRanks.get(subjectId) ?? null,
    }));
  }, [comparisonLeftEvaluations, comparisonRightEvaluations]);
  const comparisonChartRows = useMemo<DecisionRankComparisonRow[]>(
    () => comparisonRows.map((row) => ({
      subjectId: row.subjectId,
      leftRank: row.leftRank,
      rightRank: row.rightRank,
    })),
    [comparisonRows],
  );

  const sensitivityParameter = useMemo(
    () => selectedFunction?.parameters.find((parameter) => parameter.id === sensitivityParameterId) ?? null,
    [selectedFunction, sensitivityParameterId],
  );
  const sensitivitySeries = useMemo(
    () => activeAnalysis === null || selectedFunction === null || sensitivityParameter === null || isEditing
      ? []
      : evaluateSensitivity(activeAnalysis, selectedFunction, sensitivityParameter),
    [activeAnalysis, isEditing, selectedFunction, sensitivityParameter],
  );
  const sensitivityCrossings = useMemo(
    () => isEditing ? [] : detectDecisionSensitivityCrossings(sensitivitySeries),
    [isEditing, sensitivitySeries],
  );
  const selectedEffectiveParameters = useMemo(() =>
  {
    if (selectedFunction === null)
    {
      return {} as DecisionParameters;
    }
    try
    {
      return effectiveDecisionParameters(selectedFunction);
    }
    catch
    {
      return {} as DecisionParameters;
    }
  }, [selectedFunction]);
  const draftEffectiveParameters = useMemo(() =>
  {
    if (draft === null)
    {
      return {} as DecisionParameters;
    }
    try
    {
      return effectiveDecisionParameters(draft);
    }
    catch
    {
      return {} as DecisionParameters;
    }
  }, [draft]);
  const sensitivityEffectiveValue = useMemo(() =>
  {
    if (selectedFunction === null || sensitivityParameter === null)
    {
      return null;
    }
    return selectedEffectiveParameters[sensitivityParameter.id.toLowerCase()] ?? null;
  }, [selectedEffectiveParameters, selectedFunction, sensitivityParameter]);

  const selectAnalysis = (nextId: string) =>
  {
    changeAnalysis(nextId);
  };

  const selectFunction = (nextId: string) =>
  {
    setSelectedFunctionId(nextId);
    setIsEditing(false);
    setSaveMessage(null);
  };

  const duplicateFunction = () =>
  {
    if (selectedFunction === null)
    {
      return;
    }
    const custom = saveDecisionFunction(createCustomDecisionFunction(selectedFunction));
    const nextFunctions = listDecisionFunctions();
    setFunctions(nextFunctions);
    setSelectedFunctionId(custom.id);
    setDraft(cloneDefinition(custom));
    setIsEditing(true);
    setSaveMessage("Custom copy created. Save to apply edits.");
  };

  const createFunction = () =>
  {
    const custom = saveDecisionFunction(createCustomDecisionFunction());
    setFunctions(listDecisionFunctions());
    setSelectedFunctionId(custom.id);
    setDraft(cloneDefinition(custom));
    setIsEditing(true);
    setSaveMessage("New function created. Save to apply edits.");
  };

  const toggleEditSave = () =>
  {
    if (draft === null || draft.source !== "custom")
    {
      return;
    }
    if (!isEditing)
    {
      setIsEditing(true);
      setSaveMessage("Result invalidated until this edit is saved.");
      return;
    }
    if (recipeError !== null)
    {
      return;
    }

    const saved = saveDecisionFunction(draft);
    const nextFunctions = listDecisionFunctions();
    setFunctions(nextFunctions);
    setSelectedFunctionId(saved.id);
    setDraft(cloneDefinition(saved));
    setIsEditing(false);
    setSaveMessage("Saved locally. Decision result refreshed.");
  };

  const cancelEdit = () =>
  {
    if (selectedFunction === null)
    {
      return;
    }
    setDraft(cloneDefinition(selectedFunction));
    setIsEditing(false);
    setSaveMessage("Unsaved edits discarded.");
  };

  const removeFunction = () =>
  {
    if (selectedFunction === null || selectedFunction.source !== "custom")
    {
      return;
    }
    deleteDecisionFunction(selectedFunction.id);
    const nextFunctions = listDecisionFunctions();
    setFunctions(nextFunctions);
    setSelectedFunctionId(nextFunctions[0]?.id ?? "");
    setIsEditing(false);
    setSaveMessage("Custom function deleted.");
  };

  const updateParameter = (index: number, patch: Partial<DecisionParameterDefinition>) =>
  {
    if (draft === null)
    {
      return;
    }
    const parameters = draft.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    setDraft({ ...draft, parameters });
  };

  const updateParameterGroup = (index: number, patch: Partial<DecisionParameterGroupDefinition>) =>
  {
    if (draft === null)
    {
      return;
    }
    const previous = draft.parameterGroups[index];
    const parameterGroups = draft.parameterGroups.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    let parameters = draft.parameters;
    if (patch.id !== undefined && previous !== undefined && patch.id !== previous.id)
    {
      parameters = draft.parameters.map((parameter) => parameter.groupId === previous.id ? { ...parameter, groupId: patch.id ?? null } : parameter);
    }
    setDraft({ ...draft, parameterGroups, parameters });
  };

  const addParameterGroup = () =>
  {
    if (draft === null)
    {
      return;
    }
    let number = draft.parameterGroups.length + 1;
    let id = `group_${number}`;
    const existing = new Set(draft.parameterGroups.map((item) => item.id.toLowerCase()));
    while (existing.has(id))
    {
      number += 1;
      id = `group_${number}`;
    }
    setDraft({
      ...draft,
      parameterGroups: [...draft.parameterGroups, { id, label: `Parameter group ${number}`, policy: "none" }],
    });
  };

  const removeParameterGroup = (index: number) =>
  {
    if (draft === null)
    {
      return;
    }
    const removed = draft.parameterGroups[index];
    if (removed === undefined)
    {
      return;
    }
    setDraft({
      ...draft,
      parameterGroups: draft.parameterGroups.filter((_, itemIndex) => itemIndex !== index),
      parameters: draft.parameters.map((parameter) => parameter.groupId === removed.id ? { ...parameter, groupId: null } : parameter),
    });
  };

  const addParameter = () =>
  {
    if (draft === null)
    {
      return;
    }
    let number = draft.parameters.length + 1;
    let id = `parameter_${number}`;
    const existing = new Set(draft.parameters.map((item) => item.id.toLowerCase()));
    while (existing.has(id))
    {
      number += 1;
      id = `parameter_${number}`;
    }
    setDraft({
      ...draft,
      parameters: [...draft.parameters, {
        id,
        label: `Parameter ${number}`,
        value: 1,
        min: null,
        max: null,
        step: null,
        control: "number",
        groupId: null,
      }],
    });
  };

  const removeParameter = (index: number) =>
  {
    if (draft === null)
    {
      return;
    }
    setDraft({ ...draft, parameters: draft.parameters.filter((_, itemIndex) => itemIndex !== index) });
  };

  const updateRule = (index: number, patch: Partial<DecisionEligibilityRule>) =>
  {
    if (draft === null)
    {
      return;
    }
    const eligibilityRules = draft.eligibilityRules.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    setDraft({ ...draft, eligibilityRules });
  };

  const addRule = () =>
  {
    if (draft === null)
    {
      return;
    }
    setDraft({
      ...draft,
      eligibilityRules: [
        ...draft.eligibilityRules,
        { id: `rule-${Date.now()}-${draft.eligibilityRules.length}`, metric: "boundary", operator: ">=", threshold: 0.8 },
      ],
    });
  };

  const removeRule = (index: number) =>
  {
    if (draft === null)
    {
      return;
    }
    setDraft({ ...draft, eligibilityRules: draft.eligibilityRules.filter((_, itemIndex) => itemIndex !== index) });
  };

  const exportFunction = () =>
  {
    if (selectedFunction === null || isEditing)
    {
      return;
    }
    const blob = new Blob([serializeDecisionRecipe(selectedFunction)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = decisionRecipeFileName(selectedFunction);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSaveMessage("Decision recipe exported.");
  };

  const importFunction = async (event: ChangeEvent<HTMLInputElement>) =>
  {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined)
    {
      return;
    }

    try
    {
      const imported = parseDecisionRecipe(await file.text());
      const validationError = validateRecipe(imported);
      if (validationError !== null)
      {
        throw new Error(validationError);
      }
      const saved = saveDecisionFunction(imported);
      setFunctions(listDecisionFunctions());
      setSelectedFunctionId(saved.id);
      setDraft(cloneDefinition(saved));
      setIsEditing(false);
      setSaveMessage(`Imported '${saved.name}' as a local custom function.`);
    }
    catch (error)
    {
      setSaveMessage(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
    }
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Decision Workshop</p>
          <h1>Apply an explicit decision function to ACMM profiles.</h1>
        </div>
        <p>
          Workshop results are conditional on the selected decision function. The underlying ACMM profiles are not changed.
        </p>
      </section>

      {loading && <div className="working-box">Loading the shared ACMM export session...</div>}

      {!loading && loadError !== null && (
        <div className="error-box">
          <strong>Cached export could not be loaded.</strong>
          <span>{loadError}</span>
        </div>
      )}

      {!loading && dataset === null && loadError === null && (
        <section className="empty-workshop-card">
          <p className="eyebrow">No active export</p>
          <h2>Open an ACMM export before using the workshop.</h2>
          <p>The workshop uses the same shared normalized export session as Overview and Data Explorer.</p>
          <button className="button button-primary" type="button" onClick={() => onNavigate("explorer")}>Open Data Explorer</button>
        </section>
      )}

      {!loading && dataset !== null && activeAnalysis === null && loadError === null && (
        <section className="empty-workshop-card">
          <p className="eyebrow">Analysis selection required</p>
          <h2>Select an analysis snapshot before using the workshop.</h2>
          <p>The loaded export contains multiple analyzed snapshots and no active snapshot is selected yet.</p>
          <button className="button button-primary" type="button" onClick={() => onNavigate("explorer")}>Select in Data Explorer</button>
        </section>
      )}

      {dataset !== null && activeAnalysis !== null && draft !== null && selectedFunction !== null && (
        <>
          <section className="workshop-context-card">
            <div>
              <p className="eyebrow">Active evidence</p>
              <h2>{dataset.experimentId}</h2>
            </div>
            <label className="analysis-switcher workshop-analysis-switcher">
              <span>Analysis</span>
              <select value={analysisId} onChange={(event: ChangeEvent<HTMLSelectElement>) => selectAnalysis(event.target.value)}>
                {dataset.analyses.map((analysis) => (
                  <option key={analysis.id} value={analysis.id}>
                    {analysis.planSchemaVersion === null ? analysis.label : `Plan ${analysis.planSchemaVersion} / ${analysis.id}`}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <div className="decision-notice">
            <strong>Conditional result</strong>
            <span>Ranking reflects the selected saved function only. It is not an intrinsic ACMM good/bad score.</span>
          </div>

          <section className="workshop-summary-grid">
            <div className="workshop-radar-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Canonical evidence</p>
                  <h2>Merged compliance profiles</h2>
                </div>
                <span className="tag tag-muted">Unmodified</span>
              </div>
              <ComplianceMultiRadar profiles={activeAnalysis.profiles} />
              <p className="panel-note">The radar always displays exported ACMM point estimates. Decision functions do not reshape the profile.</p>
            </div>

            <div className="decision-function-summary-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Function store</p>
                  <h2>Selected decision function</h2>
                </div>
                <span className={selectedFunction.source === "preset" ? "tag tag-muted" : "tag tag-ready"}>{selectedFunction.source}</span>
              </div>

              <label className="field-label summary-function-selector">
                <span>Stored function</span>
                <select
                  value={selectedFunctionId}
                  disabled={isEditing}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => selectFunction(event.target.value)}
                >
                  {presetCategories.map((category) => (
                    <optgroup key={category} label={`Preset - ${category}`}>
                      {functions
                        .filter((item) => item.source === "preset" && item.category === category)
                        .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </optgroup>
                  ))}
                  {functions.some((item) => item.source === "custom") && (
                    <optgroup label="Custom">
                      {functions.filter((item) => item.source === "custom").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>

              <p className="function-summary-description">{selectedFunction.description}</p>
              <div className="function-summary-expression">
                <span>Expression</span>
                <code>{selectedFunction.expression}</code>
              </div>

              <div className="function-summary-groups">
                <div>
                  <span>Decision evidence</span>
                  <strong>{evidenceModeLabels[selectedFunction.evidenceMode]}</strong>
                </div>
                <div>
                  <span>Parameters</span>
                  {selectedFunction.parameters.length === 0
                    ? <strong>None</strong>
                    : <div className="function-summary-values">
                        {selectedFunction.parameters.map((parameter) =>
                        {
                          const effective = selectedEffectiveParameters[parameter.id.toLowerCase()] ?? parameter.value;
                          const normalized = parameter.groupId !== null
                            && selectedFunction.parameterGroups.some((group) => group.id.toLowerCase() === parameter.groupId?.toLowerCase() && group.policy === "sum-to-one");
                          return (
                            <code key={parameter.id}>
                              {parameter.id}={formatParameterValue(effective)}{normalized ? ` (raw ${formatParameterValue(parameter.value)})` : ""}
                            </code>
                          );
                        })}
                      </div>}
                </div>
                <div>
                  <span>Parameter groups</span>
                  {selectedFunction.parameterGroups.length === 0
                    ? <strong>None</strong>
                    : <div className="function-summary-group-list">
                        {selectedFunction.parameterGroups.map((group) => (
                          <div className="function-summary-group-row" key={group.id}>
                            <span className="function-summary-group-label">{group.label}</span>
                            <span className="function-summary-group-policy">{group.policy === "sum-to-one" ? "Sum to 1" : "No transform"}</span>
                          </div>
                        ))}
                      </div>}
                </div>
                <div>
                  <span>Eligibility</span>
                  {selectedFunction.eligibilityRules.length === 0
                    ? <strong>None</strong>
                    : <div className="function-summary-values">
                        {selectedFunction.eligibilityRules.map((rule) => (
                          <code key={rule.id}>{describeRule(rule)}</code>
                        ))}
                      </div>}
                </div>
              </div>

              {isEditing && (
                <div className="saved-function-note">A draft is being edited below. This summary remains on the last saved version.</div>
              )}
            </div>

            <div className={`decision-result-panel ${isEditing ? "result-invalidated" : ""}`}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Decision result</p>
                  <h2>Ranking</h2>
                </div>
                <span className={isEditing ? "tag tag-warning" : "tag tag-ready"}>
                  {isEditing ? "invalidated" : selectedFunction.name}
                </span>
              </div>

              {isEditing ? (
                <div className="preview-empty compact-empty invalidated-result-message">
                  <strong>Decision result is out of date.</strong>
                  <span>Save the edited function to evaluate it against the active profiles.</span>
                </div>
              ) : (
                <>
                  <div className="decision-ranking">
                    {evaluations.map((evaluation) =>
                    {
                      const rank = evaluation.eligible === true && evaluation.value !== null
                        ? evaluations.filter((item) => item.eligible === true && item.value !== null).findIndex((item) => item.subjectId === evaluation.subjectId) + 1
                        : null;
                      return (
                        <div className={`decision-rank-row ${evaluation.eligible === false ? "rank-ineligible" : ""}`} key={evaluation.subjectId}>
                          <span className="rank-number">{rank ?? "-"}</span>
                          <span className="rank-subject">{evaluation.subjectId}</span>
                          <strong>
                            {evaluation.error !== null
                              ? "Unavailable"
                              : evaluation.eligible === false
                                ? "Ineligible"
                                : evaluation.value?.toFixed(4) ?? "Unavailable"}
                          </strong>
                          {evaluation.eligible === false && evaluation.failedRules.length > 0 && (
                            <small>Failed: {evaluation.failedRules.join("; ")}</small>
                          )}
                          {evaluation.error !== null && <small>{evaluation.error}</small>}
                        </div>
                      );
                    })}
                  </div>

                  <div className="score-visual-block">
                    <div className="score-visual-heading">
                      <strong>Decision score comparison</strong>
                      <span>Raw function output; eligible agents only.</span>
                    </div>
                    <DecisionScoreChart evaluations={evaluations} />
                  </div>
                </>
              )}

              <div className="result-method result-method-grid">
                <div><span>Decision evidence</span><strong>{evidenceModeLabels[selectedFunction.evidenceMode]}</strong></div>
                <div><span>Analysis profile</span><strong>{activeAnalysis.profileEstimand} / {activeAnalysis.profileAggregationMethod} / {activeAnalysis.profileWeighting}</strong></div>
              </div>
            </div>
          </section>

          <div className="workshop-stack">
            <section className={`workshop-section-card function-editor-section ${isEditing ? "panel-editing" : ""}`}>
              <div className="panel-heading section-heading-wide">
                <div>
                  <p className="eyebrow">Function editor</p>
                  <h2>{isEditing ? "Edit decision recipe" : "Decision recipe definition"}</h2>
                  <p>Changes remain a draft until Save. The summary and result above stay tied to the last saved function.</p>
                </div>
                <span className={isEditing ? "tag tag-warning" : "tag tag-muted"}>{isEditing ? "editing draft" : "locked"}</span>
              </div>

              <div className="function-editor-layout">
                <div className="function-editor-definition">
                  <label className="field-label">
                    <span>Name</span>
                    <input
                      value={draft.name}
                      disabled={!isEditing}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </label>

                  <label className="field-label">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={draft.description}
                      disabled={!isEditing}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft({ ...draft, description: event.target.value })}
                    />
                  </label>

                  <label className="field-label">
                    <span>Category</span>
                    <input
                      value={draft.category}
                      disabled={!isEditing}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, category: event.target.value })}
                    />
                  </label>

                  <label className="field-label">
                    <span>Decision evidence</span>
                    <select
                      value={draft.evidenceMode}
                      disabled={!isEditing}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraft({ ...draft, evidenceMode: event.target.value as DecisionEvidenceMode })}
                    >
                      <option value="point-estimate">Point estimate</option>
                      <option value="lower-confidence-bound">Lower confidence bound</option>
                    </select>
                    <small className="field-help">Controls which exported compliance value is supplied to the six expression variables and dimension eligibility rules.</small>
                  </label>

                  <label className="field-label">
                    <span>Expression</span>
                    <textarea
                      className="decision-expression"
                      rows={6}
                      spellCheck={false}
                      value={draft.expression}
                      disabled={!isEditing}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft({ ...draft, expression: event.target.value })}
                    />
                  </label>

                  {isEditing && (
                    recipeError !== null
                      ? <div className="expression-status expression-error">{recipeError}</div>
                      : <div className="expression-status expression-valid">Recipe is valid and ready to save.</div>
                  )}

                  <details className="function-reference">
                    <summary>Expression reference</summary>
                    <div className="function-reference-list">
                      <div><strong>Variables</strong><code>goal, obligation, boundary, procedure, fidelity, recovery</code></div>
                      <div><strong>Parameters</strong><code>recipe-defined identifiers such as w_boundary</code></div>
                      <div><strong>Operators</strong><code>+ - * / ^ ( )</code></div>
                      <div><strong>Functions</strong><code>abs, sqrt, exp, log, log10, sin, cos, tan, min, max, pow, clamp</code></div>
                      <div><strong>Constants</strong><code>pi, e</code></div>
                    </div>
                  </details>
                </div>

                <div className="function-editor-collections">
                  <div className="recipe-subsection editor-first-subsection">
                    <div className="recipe-subsection-heading">
                      <div>
                        <strong>Parameter groups <span className="recipe-count">{draft.parameterGroups.length}</span></strong>
                        <span>Optional policies transform raw parameter values before expression evaluation.</span>
                      </div>
                      {isEditing && <button className="text-button" type="button" onClick={addParameterGroup}>Add group</button>}
                    </div>
                    {draft.parameterGroups.length === 0 ? (
                      <span className="recipe-empty">No parameter groups. Parameter values are passed to the expression unchanged.</span>
                    ) : (
                      <div className="parameter-group-list">
                        <div className="parameter-group-list-header" aria-hidden="true">
                          <span>Identifier</span><span>Label</span><span>Policy</span><span />
                        </div>
                        {draft.parameterGroups.map((group, index) => (
                          <div className="parameter-group-row" key={`${group.id}-${index}`}>
                            <input aria-label="Parameter group identifier" value={group.id} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLInputElement>) => updateParameterGroup(index, { id: event.target.value.toLowerCase() })} />
                            <input aria-label="Parameter group label" value={group.label} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLInputElement>) => updateParameterGroup(index, { label: event.target.value })} />
                            <select aria-label="Parameter group policy" value={group.policy} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateParameterGroup(index, { policy: event.target.value as DecisionParameterGroupPolicy })}>
                              <option value="none">No transform</option>
                              <option value="sum-to-one">Normalize: sum to 1</option>
                            </select>
                            {isEditing && <button className="row-remove-button" type="button" onClick={() => removeParameterGroup(index)}>Remove</button>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="recipe-subsection">
                    <div className="recipe-subsection-heading">
                      <div>
                        <strong>Parameters <span className="recipe-count">{draft.parameters.length}</span></strong>
                        <span>Named numeric values available to the expression.</span>
                      </div>
                      {isEditing && <button className="text-button" type="button" onClick={addParameter}>Add parameter</button>}
                    </div>
                    {draft.parameters.length === 0 ? (
                      <span className="recipe-empty">No parameters.</span>
                    ) : (
                      <div className="parameter-list">
                        <div className="parameter-list-header" aria-hidden="true">
                          <span>Symbol</span><span>Label</span><span>Value</span><span />
                        </div>
                        {draft.parameters.map((parameter, index) => (
                          <div className="parameter-entry" key={`${parameter.id}-${index}`}>
                            <div className="parameter-row">
                              <input aria-label="Parameter symbol" value={parameter.id} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLInputElement>) => updateParameter(index, { id: event.target.value.toLowerCase() })} />
                              <input aria-label="Parameter label" value={parameter.label} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLInputElement>) => updateParameter(index, { label: event.target.value })} />
                              <div className="parameter-value-control">
                                {parameter.control === "slider" && parameter.min !== null && parameter.max !== null && (
                                  <input className="parameter-slider" aria-label={`${parameter.label} slider`} type="range" min={parameter.min} max={parameter.max} step={parameter.step ?? "any"} value={parameter.value} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLInputElement>) => updateParameter(index, { value: Number(event.target.value) })} />
                                )}
                                <input aria-label="Parameter value" type="number" min={parameter.min ?? undefined} max={parameter.max ?? undefined} step={parameter.step ?? "any"} value={parameter.value} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLInputElement>) => updateParameter(index, { value: Number(event.target.value) })} />
                                {parameter.groupId !== null && draft.parameterGroups.some((group) => group.id.toLowerCase() === parameter.groupId?.toLowerCase() && group.policy === "sum-to-one") && draftEffectiveParameters[parameter.id.toLowerCase()] !== undefined && (
                                  <small className="parameter-effective-value">Effective {formatParameterValue(draftEffectiveParameters[parameter.id.toLowerCase()])}</small>
                                )}
                              </div>
                              {isEditing && <button className="row-remove-button" type="button" onClick={() => removeParameter(index)}>Remove</button>}
                            </div>
                            {isEditing && (
                              <details className="parameter-options">
                                <summary>
                                  <span>Control settings</span>
                                  <small>{parameter.control === "slider" ? "Slider" : "Number"}{parameter.groupId !== null ? ` | ${draft.parameterGroups.find((group) => group.id.toLowerCase() === parameter.groupId?.toLowerCase())?.label ?? parameter.groupId}` : ""}{parameter.min !== null && parameter.max !== null ? ` | ${parameter.min} to ${parameter.max}` : ""}{parameter.step !== null ? ` | step ${parameter.step}` : ""}</small>
                                </summary>
                                <div className="parameter-metadata-row">
                                  <label><span>Group</span><select aria-label="Parameter group" value={parameter.groupId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateParameter(index, { groupId: event.target.value === "" ? null : event.target.value })}><option value="">None</option>{draft.parameterGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
                                  <label><span>Control</span><select aria-label="Parameter control" value={parameter.control} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateParameter(index, { control: event.target.value as DecisionParameterControl })}><option value="number">Number</option><option value="slider">Slider</option></select></label>
                                  <label><span>Min</span><input aria-label="Parameter minimum" type="number" step="any" value={parameter.min ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateParameter(index, { min: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                                  <label><span>Max</span><input aria-label="Parameter maximum" type="number" step="any" value={parameter.max ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateParameter(index, { max: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                                  <label><span>Step</span><input aria-label="Parameter step" type="number" step="any" value={parameter.step ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateParameter(index, { step: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                                </div>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="recipe-subsection">
                    <div className="recipe-subsection-heading">
                      <div>
                        <strong>Eligibility rules <span className="recipe-count">{draft.eligibilityRules.length}</span></strong>
                        <span>Hard requirements evaluated before ranking. Dimension rules use the selected decision evidence; availability uses the exported 0-1 analysis metric.</span>
                      </div>
                      {isEditing && <button className="text-button" type="button" onClick={addRule}>Add rule</button>}
                    </div>
                    {draft.eligibilityRules.length === 0 ? (
                      <span className="recipe-empty">No eligibility rules.</span>
                    ) : (
                      <div className="eligibility-list">
                        <div className="eligibility-list-header" aria-hidden="true"><span>Metric</span><span>Op</span><span>Threshold</span><span /></div>
                        {draft.eligibilityRules.map((rule, index) => (
                          <div className="eligibility-row" key={rule.id}>
                            <select aria-label="Eligibility metric" value={rule.metric} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateRule(index, { metric: event.target.value as DecisionEligibilityMetric })}>
                              <optgroup label="Compliance dimensions">
                                {complianceDimensions.map((dimension) => <option key={dimension} value={dimension}>{dimensionLabels[dimension]}</option>)}
                              </optgroup>
                              <optgroup label="Analysis metrics">
                                <option value="availability">Availability</option>
                              </optgroup>
                            </select>
                            <select aria-label="Eligibility operator" value={rule.operator} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateRule(index, { operator: event.target.value as EligibilityOperator })}>
                              {eligibilityOperators.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                            </select>
                            <input aria-label="Eligibility threshold" type="number" step="any" value={rule.threshold} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLInputElement>) => updateRule(index, { threshold: Number(event.target.value) })} />
                            {isEditing && <button className="row-remove-button" type="button" onClick={() => removeRule(index)}>Remove</button>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="decision-actions editor-actions">
                {draft.source === "preset" ? (
                  <button className="button button-secondary" type="button" onClick={duplicateFunction}>Duplicate as custom</button>
                ) : (
                  <>
                    <button className="button button-primary" type="button" disabled={isEditing && recipeError !== null} onClick={toggleEditSave}>{isEditing ? "Save" : "Edit"}</button>
                    {isEditing
                      ? <button className="button button-secondary" type="button" onClick={cancelEdit}>Cancel</button>
                      : <button className="button button-secondary" type="button" onClick={removeFunction}>Delete</button>}
                  </>
                )}
                <button className="text-button" type="button" onClick={createFunction}>New function</button>
                <button className="text-button" type="button" disabled={isEditing} onClick={exportFunction}>Export recipe</button>
                <button className="text-button" type="button" disabled={isEditing} onClick={() => recipeImportRef.current?.click()}>Import recipe</button>
                <input ref={recipeImportRef} className="visually-hidden" type="file" accept="application/json,.json" tabIndex={-1} onChange={(event: ChangeEvent<HTMLInputElement>) => void importFunction(event)} />
              </div>
              {saveMessage !== null && <small className="save-message">{saveMessage}</small>}
            </section>

            <section className={`workshop-section-card sensitivity-section ${isEditing ? "section-invalidated" : ""}`}>
              <div className="panel-heading section-heading-wide">
                <div>
                  <p className="eyebrow">Parameter sensitivity</p>
                  <h2>One-parameter decision sweep</h2>
                  <p>Vary one saved parameter across its configured bounds while holding every other parameter fixed.</p>
                </div>
                <span className={isEditing ? "tag tag-warning" : "tag tag-muted"}>{isEditing ? "invalidated" : "saved recipe only"}</span>
              </div>

              {isEditing ? (
                <div className="preview-empty compact-empty invalidated-result-message">
                  <strong>Sensitivity view is out of date.</strong>
                  <span>Save or cancel the current draft before evaluating parameter sensitivity.</span>
                </div>
              ) : selectedFunction.parameters.every((parameter) => parameter.min === null || parameter.max === null || parameter.max <= parameter.min) ? (
                <div className="preview-empty compact-empty">
                  <strong>No bounded parameters are available.</strong>
                  <span>Configure a parameter with both minimum and maximum values to enable this view.</span>
                </div>
              ) : sensitivityParameter === null ? null : (
                <>
                  <div className="sensitivity-toolbar">
                    <label className="field-label">
                      <span>Parameter</span>
                      <select value={sensitivityParameterId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSensitivityParameterId(event.target.value)}>
                        {selectedFunction.parameters
                          .filter((parameter) => parameter.min !== null && parameter.max !== null && parameter.max > parameter.min)
                          .map((parameter) => <option key={parameter.id} value={parameter.id}>{parameter.label} ({parameter.id})</option>)}
                      </select>
                    </label>
                    <div className="sensitivity-stat"><span>Current raw</span><strong>{formatParameterValue(sensitivityParameter.value)}</strong></div>
                    {sensitivityParameter.groupId !== null && selectedFunction.parameterGroups.some((group) => group.id.toLowerCase() === sensitivityParameter.groupId?.toLowerCase() && group.policy === "sum-to-one") && sensitivityEffectiveValue !== null && (
                      <div className="sensitivity-stat"><span>Current effective</span><strong>{formatParameterValue(sensitivityEffectiveValue)}</strong></div>
                    )}
                    <div className="sensitivity-stat"><span>Minimum</span><strong>{sensitivityParameter.min}</strong></div>
                    <div className="sensitivity-stat"><span>Maximum</span><strong>{sensitivityParameter.max}</strong></div>
                    <div className="sensitivity-stat"><span>Samples</span><strong>41</strong></div>
                  </div>
                  <DecisionSensitivityChart series={sensitivitySeries} parameterLabel={sensitivityParameter.label} currentValue={sensitivityParameter.value} />
                  <div className="sensitivity-crossings">
                    <div className="sensitivity-crossings-heading">
                      <strong>Approximate ranking changes</strong>
                      <span>Pairwise score crossings detected from the sampled sweep.</span>
                    </div>
                    {sensitivityCrossings.length === 0 ? (
                      <div className="sensitivity-crossing-empty">No pairwise ranking changes were detected across this parameter range.</div>
                    ) : (
                      <div className="sensitivity-crossing-list">
                        {sensitivityCrossings.map((crossing, index) => (
                          <div className="sensitivity-crossing-row" key={`${crossing.firstSubjectId}-${crossing.secondSubjectId}-${crossing.parameterValue}-${index}`}>
                            <code>{sensitivityParameter.id} ~= {formatParameterValue(crossing.parameterValue)}</code>
                            <span><strong>{crossing.afterLeader}</strong> overtakes {crossing.beforeLeader}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="panel-note">This sweep varies the saved raw parameter value, reapplies any parameter-group normalization at every sample, and evaluates the recipe using its saved decision-evidence basis. It does not modify the saved recipe or canonical ACMM profiles.</p>
                </>
              )}
            </section>

            <section className={`workshop-section-card comparison-section ${isEditing ? "section-invalidated" : ""}`}>
              <div className="panel-heading section-heading-wide">
                <div>
                  <p className="eyebrow">Decision comparison</p>
                  <h2>Compare two saved decision recipes</h2>
                  <p>Apply two saved recipes to the same analysis and compare ranking positions. Raw decision outputs remain visible, but are not treated as a common scale.</p>
                </div>
                <span className={isEditing ? "tag tag-warning" : "tag tag-muted"}>{isEditing ? "invalidated" : "saved recipes only"}</span>
              </div>

              {isEditing ? (
                <div className="preview-empty compact-empty invalidated-result-message">
                  <strong>Decision comparison is out of date.</strong>
                  <span>Save or cancel the current draft before comparing saved decision recipes.</span>
                </div>
              ) : comparisonLeftFunction === null || comparisonRightFunction === null ? (
                <div className="preview-empty compact-empty">
                  <strong>Two saved functions are required.</strong>
                  <span>Create or select another saved decision function to enable comparison.</span>
                </div>
              ) : (
                <>
                  <div className="comparison-function-selectors">
                    <label className="field-label">
                      <span>Function A</span>
                      <select value={comparisonLeftId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setComparisonLeftId(event.target.value)}>
                        {presetCategories.map((category) => (
                          <optgroup key={`left-${category}`} label={`Preset - ${category}`}>
                            {functions.filter((item) => item.source === "preset" && item.category === category).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </optgroup>
                        ))}
                        {functions.some((item) => item.source === "custom") && (
                          <optgroup label="Custom">
                            {functions.filter((item) => item.source === "custom").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                      <small className="field-help">Evidence: {evidenceModeLabels[comparisonLeftFunction.evidenceMode]}</small>
                    </label>
                    <div className="comparison-arrow" aria-hidden="true">versus</div>
                    <label className="field-label">
                      <span>Function B</span>
                      <select value={comparisonRightId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setComparisonRightId(event.target.value)}>
                        {presetCategories.map((category) => (
                          <optgroup key={`right-${category}`} label={`Preset - ${category}`}>
                            {functions.filter((item) => item.source === "preset" && item.category === category).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </optgroup>
                        ))}
                        {functions.some((item) => item.source === "custom") && (
                          <optgroup label="Custom">
                            {functions.filter((item) => item.source === "custom").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                      <small className="field-help">Evidence: {evidenceModeLabels[comparisonRightFunction.evidenceMode]}</small>
                    </label>
                  </div>

                  <div className="decision-comparison-layout">
                    <div className="comparison-rank-chart-block">
                      <div className="score-visual-heading">
                        <strong>Rank movement</strong>
                        <span>Eligible ranking position only; lower rank number is better.</span>
                      </div>
                      <DecisionRankComparisonChart
                        leftLabel="Function A"
                        rightLabel="Function B"
                        rows={comparisonChartRows}
                      />
                    </div>

                    <div className="decision-comparison-table-wrap">
                      <table className="decision-comparison-table">
                        <thead>
                          <tr>
                            <th>Agent</th>
                            <th>A rank</th>
                            <th>A output</th>
                            <th>B rank</th>
                            <th>B output</th>
                            <th>Rank change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonRows.map((row) =>
                          {
                            const change = row.leftRank !== null && row.rightRank !== null ? row.leftRank - row.rightRank : null;
                            return (
                              <tr key={row.subjectId}>
                                <td><strong>{row.subjectId}</strong></td>
                                <td>{row.leftRank === null ? "-" : `#${row.leftRank}`}</td>
                                <td>{evaluationLabel(row.leftEvaluation)}</td>
                                <td>{row.rightRank === null ? "-" : `#${row.rightRank}`}</td>
                                <td>{evaluationLabel(row.rightEvaluation)}</td>
                                <td className={change === null ? "" : change > 0 ? "rank-change-up" : change < 0 ? "rank-change-down" : "rank-change-same"}>
                                  {change === null ? "-" : change > 0 ? `+${change}` : change.toString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="panel-note">Function outputs are shown for traceability only. Because recipes may use different formulas, evidence bases, parameter scales, or eligibility rules, numeric outputs across Function A and Function B are not assumed to be directly comparable.</p>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
