import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { AppView } from "../app/navigation";
import { detectAdapters, normalizeWithAdapter } from "../data/adapters/registry";
import { readCachedExport, updateCachedSelection } from "../data/cache/exportCache";
import { inspectFiles } from "../data/ingest/inspect";
import { complianceDimensions, type AcmmExportDataset, type AnalysisSnapshot, type AgentProfile } from "../data/model";
import {
  evaluateDecisionExpression,
  isValidParameterId,
  validateDecisionExpression,
  type DecisionParameters,
  type DecisionVariables,
} from "../decision/expression";
import type {
  DecisionDimension,
  DecisionEligibilityRule,
  DecisionEvaluation,
  DecisionFunctionDefinition,
  DecisionParameterControl,
  DecisionParameterDefinition,
  EligibilityOperator,
} from "../decision/model";
import {
  createCustomDecisionFunction,
  deleteDecisionFunction,
  listDecisionFunctions,
  saveDecisionFunction,
} from "../decision/store";
import { decisionRecipeFileName, parseDecisionRecipe, serializeDecisionRecipe } from "../decision/transfer";
import { ComplianceMultiRadar } from "../visualization/ComplianceMultiRadar";
import { DecisionScoreChart } from "../visualization/DecisionScoreChart";
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

const eligibilityOperators: EligibilityOperator[] = [">=", ">", "<=", "<"];

function profileVariables(profile: AgentProfile): DecisionVariables | null
{
  const values = new Map(profile.dimensions.map((item) => [item.dimension, item.score]));
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

function parameterRecord(definition: DecisionFunctionDefinition): DecisionParameters
{
  return Object.fromEntries(definition.parameters.map((item) => [item.id.toLowerCase(), item.value]));
}

function rulePasses(rule: DecisionEligibilityRule, variables: DecisionVariables): boolean
{
  const value = variables[rule.dimension];
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
  return `${dimensionLabels[rule.dimension]} ${rule.operator} ${rule.threshold}`;
}

function evaluateProfiles(analysis: AnalysisSnapshot, definition: DecisionFunctionDefinition): DecisionEvaluation[]
{
  const parameters = parameterRecord(definition);
  return analysis.profiles.map((profile) =>
  {
    const variables = profileVariables(profile);
    if (variables === null)
    {
      return {
        subjectId: profile.subjectId,
        value: null,
        eligible: null,
        failedRules: [],
        error: "One or more compliance dimensions are unavailable.",
      };
    }

    const failedRules = definition.eligibilityRules
      .filter((rule) => !rulePasses(rule, variables))
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
  const baseParameters = parameterRecord(definition);
  const parameterId = parameter.id.toLowerCase();

  return analysis.profiles.flatMap((profile): DecisionSensitivitySeries[] =>
  {
    const variables = profileVariables(profile);
    if (variables === null || definition.eligibilityRules.some((rule) => !rulePasses(rule, variables)))
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
          { ...baseParameters, [parameterId]: parameterValue },
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
    ids.add(id);
  }

  for (const rule of definition.eligibilityRules)
  {
    if (!Number.isFinite(rule.threshold))
    {
      return `${dimensionLabels[rule.dimension]} eligibility threshold must be finite.`;
    }
  }

  return validateDecisionExpression(definition.expression, parameterRecord(definition));
}

function cloneDefinition(definition: DecisionFunctionDefinition): DecisionFunctionDefinition
{
  return {
    ...definition,
    parameters: definition.parameters.map((item) => ({ ...item })),
    eligibilityRules: definition.eligibilityRules.map((item) => ({ ...item })),
  };
}

export function WorkshopView({ onNavigate }: WorkshopViewProps)
{
  const [dataset, setDataset] = useState<AcmmExportDataset | null>(null);
  const [analysisId, setAnalysisId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [functions, setFunctions] = useState<DecisionFunctionDefinition[]>(() => listDecisionFunctions());
  const [selectedFunctionId, setSelectedFunctionId] = useState("preset-equal-mean");
  const [draft, setDraft] = useState<DecisionFunctionDefinition | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [sensitivityParameterId, setSensitivityParameterId] = useState("");
  const recipeImportRef = useRef<HTMLInputElement>(null);

  useEffect(() =>
  {
    let cancelled = false;
    setLoading(true);
    void readCachedExport()
      .then(async (cached) =>
      {
        if (cached === null)
        {
          return;
        }

        const inspection = await inspectFiles([cached.file]);
        const exact = detectAdapters(inspection).find((match) => match.confidence === "exact");
        if (exact === undefined)
        {
          throw new Error("The cached file no longer matches a supported ACMM export adapter.");
        }
        const normalized = await normalizeWithAdapter(inspection, exact.adapterId);
        if (cancelled)
        {
          return;
        }

        setDataset(normalized);
        const preferred = cached.selectedAnalysisId === null
          ? undefined
          : normalized.analyses.find((analysis) => analysis.id === cached.selectedAnalysisId);
        const initial = preferred
          ?? normalized.analyses.find((analysis) => analysis.id === normalized.defaultAnalysisId)
          ?? normalized.analyses[0];
        setAnalysisId(initial?.id ?? "");
      })
      .catch((error) =>
      {
        if (!cancelled)
        {
          setLoadError(error instanceof Error ? error.message : "Unable to load the cached export.");
        }
      })
      .finally(() =>
      {
        if (!cancelled)
        {
          setLoading(false);
        }
      });

    return () =>
    {
      cancelled = true;
    };
  }, []);

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

  const selectAnalysis = (nextId: string) =>
  {
    setAnalysisId(nextId);
    void readCachedExport().then((cached) =>
    {
      if (cached !== null)
      {
        void updateCachedSelection(nextId, cached.selectedSubjectId);
      }
    }).catch(() => undefined);
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
        { id: `rule-${Date.now()}-${draft.eligibilityRules.length}`, dimension: "boundary", operator: ">=", threshold: 0.8 },
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

      {loading && <div className="working-box">Loading the cached ACMM export...</div>}

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
          <p>The workshop reads the same single-slot local export cache used by Data Explorer.</p>
          <button className="button button-primary" type="button" onClick={() => onNavigate("explorer")}>Open Data Explorer</button>
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
                  <span>Parameters</span>
                  {selectedFunction.parameters.length === 0
                    ? <strong>None</strong>
                    : <div className="function-summary-values">
                        {selectedFunction.parameters.map((parameter) => (
                          <code key={parameter.id}>{parameter.id}={parameter.value}</code>
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

              <div className="result-method">
                <span>Analysis profile</span>
                <strong>{activeAnalysis.profileEstimand} / {activeAnalysis.profileAggregationMethod} / {activeAnalysis.profileWeighting}</strong>
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
                              </div>
                              {isEditing && <button className="row-remove-button" type="button" onClick={() => removeParameter(index)}>Remove</button>}
                            </div>
                            {isEditing && (
                              <details className="parameter-options">
                                <summary>
                                  <span>Control settings</span>
                                  <small>{parameter.control === "slider" ? "Slider" : "Number"}{parameter.min !== null && parameter.max !== null ? ` | ${parameter.min} to ${parameter.max}` : ""}{parameter.step !== null ? ` | step ${parameter.step}` : ""}</small>
                                </summary>
                                <div className="parameter-metadata-row">
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
                        <span>Hard requirements evaluated before ranking.</span>
                      </div>
                      {isEditing && <button className="text-button" type="button" onClick={addRule}>Add rule</button>}
                    </div>
                    {draft.eligibilityRules.length === 0 ? (
                      <span className="recipe-empty">No eligibility rules.</span>
                    ) : (
                      <div className="eligibility-list">
                        <div className="eligibility-list-header" aria-hidden="true"><span>Dimension</span><span>Op</span><span>Threshold</span><span /></div>
                        {draft.eligibilityRules.map((rule, index) => (
                          <div className="eligibility-row" key={rule.id}>
                            <select aria-label="Eligibility dimension" value={rule.dimension} disabled={!isEditing} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateRule(index, { dimension: event.target.value as DecisionDimension })}>
                              {complianceDimensions.map((dimension) => <option key={dimension} value={dimension}>{dimensionLabels[dimension]}</option>)}
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
                    <div className="sensitivity-stat"><span>Current</span><strong>{sensitivityParameter.value}</strong></div>
                    <div className="sensitivity-stat"><span>Minimum</span><strong>{sensitivityParameter.min}</strong></div>
                    <div className="sensitivity-stat"><span>Maximum</span><strong>{sensitivityParameter.max}</strong></div>
                    <div className="sensitivity-stat"><span>Samples</span><strong>41</strong></div>
                  </div>
                  <DecisionSensitivityChart series={sensitivitySeries} parameterLabel={sensitivityParameter.label} currentValue={sensitivityParameter.value} />
                  <p className="panel-note">This sweep is diagnostic only. It does not modify the saved parameter value or the canonical ACMM profiles.</p>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
