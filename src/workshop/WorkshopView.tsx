import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { AppView } from "../app/navigation";
import { detectAdapters, normalizeWithAdapter } from "../data/adapters/registry";
import { readCachedExport, updateCachedSelection } from "../data/cache/exportCache";
import { inspectFiles } from "../data/ingest/inspect";
import { complianceDimensions, type AcmmExportDataset, type AnalysisSnapshot, type AgentProfile } from "../data/model";
import { evaluateDecisionExpression, validateDecisionExpression, type DecisionVariables } from "../decision/expression";
import type { DecisionEvaluation, DecisionFunctionDefinition } from "../decision/model";
import {
  createCustomDecisionFunction,
  deleteDecisionFunction,
  listDecisionFunctions,
  saveDecisionFunction,
} from "../decision/store";
import { ComplianceMultiRadar } from "../visualization/ComplianceMultiRadar";

interface WorkshopViewProps
{
  onNavigate: (view: AppView) => void;
}

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

function evaluateProfiles(analysis: AnalysisSnapshot, expression: string): DecisionEvaluation[]
{
  return analysis.profiles.map((profile) =>
  {
    const variables = profileVariables(profile);
    if (variables === null)
    {
      return {
        subjectId: profile.subjectId,
        value: null,
        error: "One or more compliance dimensions are unavailable.",
      };
    }

    try
    {
      return {
        subjectId: profile.subjectId,
        value: evaluateDecisionExpression(expression, variables),
        error: null,
      };
    }
    catch (error)
    {
      return {
        subjectId: profile.subjectId,
        value: null,
        error: error instanceof Error ? error.message : "Evaluation failed.",
      };
    }
  }).sort((left, right) =>
  {
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

export function WorkshopView({ onNavigate }: WorkshopViewProps)
{
  const [dataset, setDataset] = useState<AcmmExportDataset | null>(null);
  const [analysisId, setAnalysisId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [functions, setFunctions] = useState<DecisionFunctionDefinition[]>(() => listDecisionFunctions());
  const [selectedFunctionId, setSelectedFunctionId] = useState("preset-equal-mean");
  const [draft, setDraft] = useState<DecisionFunctionDefinition | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

  useEffect(() =>
  {
    setDraft(selectedFunction === null ? null : { ...selectedFunction });
    setSaveMessage(null);
  }, [selectedFunction]);

  const activeAnalysis = useMemo(
    () => dataset?.analyses.find((analysis) => analysis.id === analysisId) ?? null,
    [analysisId, dataset],
  );

  const expressionError = draft === null ? "No decision function selected." : validateDecisionExpression(draft.expression);
  const evaluations = useMemo(
    () => activeAnalysis === null || draft === null || expressionError !== null
      ? []
      : evaluateProfiles(activeAnalysis, draft.expression),
    [activeAnalysis, draft, expressionError],
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

  const duplicateFunction = () =>
  {
    if (draft === null)
    {
      return;
    }
    const custom = createCustomDecisionFunction(draft);
    saveDecisionFunction(custom);
    const nextFunctions = listDecisionFunctions();
    setFunctions(nextFunctions);
    setSelectedFunctionId(custom.id);
    setSaveMessage("Created custom copy.");
  };

  const createFunction = () =>
  {
    const custom = createCustomDecisionFunction();
    saveDecisionFunction(custom);
    setFunctions(listDecisionFunctions());
    setSelectedFunctionId(custom.id);
    setSaveMessage("Created custom function.");
  };

  const saveFunction = () =>
  {
    if (draft === null || draft.source !== "custom" || expressionError !== null)
    {
      return;
    }
    saveDecisionFunction(draft);
    setFunctions(listDecisionFunctions());
    setSaveMessage("Saved locally.");
  };

  const removeFunction = () =>
  {
    if (draft === null || draft.source !== "custom")
    {
      return;
    }
    deleteDecisionFunction(draft.id);
    const nextFunctions = listDecisionFunctions();
    setFunctions(nextFunctions);
    setSelectedFunctionId(nextFunctions[0]?.id ?? "");
    setSaveMessage("Custom function deleted.");
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

      {dataset !== null && activeAnalysis !== null && draft !== null && (
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
            <span>Ranking reflects the current function only. It is not an intrinsic ACMM good/bad score.</span>
          </div>

          <section className="workshop-grid">
            <div className="decision-function-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Function store</p>
                  <h2>Decision function</h2>
                </div>
                <span className={draft.source === "preset" ? "tag tag-muted" : "tag tag-ready"}>{draft.source}</span>
              </div>

              <label className="field-label">
                <span>Stored function</span>
                <select value={selectedFunctionId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedFunctionId(event.target.value)}>
                  <optgroup label="Presets">
                    {functions.filter((item) => item.source === "preset").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </optgroup>
                  {functions.some((item) => item.source === "custom") && (
                    <optgroup label="Custom">
                      {functions.filter((item) => item.source === "custom").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>

              <label className="field-label">
                <span>Name</span>
                <input
                  value={draft.name}
                  disabled={draft.source === "preset"}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>

              <label className="field-label">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={draft.description}
                  disabled={draft.source === "preset"}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>

              <label className="field-label">
                <span>Expression</span>
                <textarea
                  className="decision-expression"
                  rows={7}
                  spellCheck={false}
                  value={draft.expression}
                  disabled={draft.source === "preset"}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft({ ...draft, expression: event.target.value })}
                />
              </label>

              {expressionError !== null
                ? <div className="expression-status expression-error">{expressionError}</div>
                : <div className="expression-status expression-valid">Expression is valid.</div>}

              <div className="decision-actions">
                {draft.source === "preset" ? (
                  <button className="button button-secondary" type="button" onClick={duplicateFunction}>Duplicate as custom</button>
                ) : (
                  <>
                    <button className="button button-primary" type="button" disabled={expressionError !== null || draft.name.trim().length === 0} onClick={saveFunction}>Save</button>
                    <button className="button button-secondary" type="button" onClick={removeFunction}>Delete</button>
                  </>
                )}
                <button className="text-button" type="button" onClick={createFunction}>New function</button>
              </div>
              {saveMessage !== null && <small className="save-message">{saveMessage}</small>}

              <div className="function-reference">
                <strong>Expression reference</strong>
                <span>Variables: goal, obligation, boundary, procedure, fidelity, recovery</span>
                <span>Operators: + - * / ^ and parentheses</span>
                <span>Functions: abs, sqrt, exp, log, log10, sin, cos, tan, min, max, pow, clamp</span>
                <span>Constants: pi, e</span>
              </div>
            </div>

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

            <div className="decision-result-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Decision result</p>
                  <h2>Ranking</h2>
                </div>
                <span className="tag tag-ready">{draft.name}</span>
              </div>

              {expressionError !== null ? (
                <div className="preview-empty compact-empty">
                  <strong>Function is not evaluable.</strong>
                  <span>Correct the expression to generate a result.</span>
                </div>
              ) : (
                <div className="decision-ranking">
                  {evaluations.map((evaluation, index) => (
                    <div className="decision-rank-row" key={evaluation.subjectId}>
                      <span className="rank-number">{evaluation.value === null ? "-" : index + 1}</span>
                      <span className="rank-subject">{evaluation.subjectId}</span>
                      <strong>{evaluation.value === null ? "Unavailable" : evaluation.value.toFixed(4)}</strong>
                      {evaluation.error !== null && <small>{evaluation.error}</small>}
                    </div>
                  ))}
                </div>
              )}

              <div className="result-method">
                <span>Analysis profile</span>
                <strong>{activeAnalysis.profileEstimand} / {activeAnalysis.profileAggregationMethod} / {activeAnalysis.profileWeighting}</strong>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
