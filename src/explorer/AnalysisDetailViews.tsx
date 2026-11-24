import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type {
  AnalysisSnapshot,
  AgentProfile,
  ComplianceDimension,
  RequirementEstimate,
} from "../data/model";
import {
  AvailabilityScenarioChart,
  RequirementChart,
  RunTrajectoryChart,
  ToolUsageChart,
} from "../visualization/AnalysisDetailCharts";

const dimensionLabels: Record<ComplianceDimension, string> = {
  goal: "Goal",
  obligation: "Obligation",
  boundary: "Boundary",
  procedure: "Procedure",
  fidelity: "Fidelity",
  recovery: "Recovery",
};

function formatNumber(value: number | null, digits = 3): string
{
  return value === null ? "-" : value.toFixed(digits);
}

function formatInteger(value: number | null): string
{
  return value === null ? "-" : Math.round(value).toLocaleString();
}

function formatPercent(value: number | null): string
{
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

interface DetailProps
{
  analysis: AnalysisSnapshot;
  profile: AgentProfile;
  onOpenSource: (path: string) => void;
}

function SourceButton({ path, label, onOpenSource }: { path: string; label: string; onOpenSource: (path: string) => void })
{
  return <button className="source-link" type="button" onClick={() => onOpenSource(path)}>{label}</button>;
}

export function RequirementDetailView({ analysis, profile, onOpenSource }: DetailProps)
{
  const estimands = useMemo(() => Array.from(new Set(
    analysis.requirements.filter((row) => row.subjectId === profile.subjectId).map((row) => row.estimand),
  )).sort(), [analysis.requirements, profile.subjectId]);
  const [estimand, setEstimand] = useState(() => estimands.includes(analysis.profileEstimand) ? analysis.profileEstimand : estimands[0] ?? "");

  useEffect(() =>
  {
    if (!estimands.includes(estimand))
    {
      setEstimand(estimands.includes(analysis.profileEstimand) ? analysis.profileEstimand : estimands[0] ?? "");
    }
  }, [analysis.profileEstimand, estimand, estimands]);

  const rows = useMemo(() => analysis.requirements
    .filter((row) => row.subjectId === profile.subjectId && row.estimand === estimand)
    .sort((a, b) => a.dimension.localeCompare(b.dimension) || a.requirementId.localeCompare(b.requirementId)),
  [analysis.requirements, profile.subjectId, estimand]);

  return (
    <section className="analysis-detail-section">
      <div className="detail-section-heading">
        <div>
          <p className="eyebrow">Requirement detail</p>
          <h3>Requirement-level compliance</h3>
          <p>Exported requirement estimates and confidence intervals for the selected subject.</p>
        </div>
        <label className="detail-select">
          <span>Estimand</span>
          <select value={estimand} onChange={(event: ChangeEvent<HTMLSelectElement>) => setEstimand(event.target.value)}>
            {estimands.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="detail-empty">No requirement-level estimates are available for this subject and estimand.</div>
      ) : (
        <>
          <div className="detail-chart-card">
            <RequirementChart requirements={rows} />
          </div>
          <div className="detail-table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Dimension</th>
                  <th>Score</th>
                  <th>Interval</th>
                  <th>Coverage</th>
                  <th>Compliant</th>
                  <th>Violation</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: RequirementEstimate) => (
                  <tr key={`${row.estimand}-${row.requirementId}`}>
                    <th>{row.requirementId}</th>
                    <td>{dimensionLabels[row.dimension]}</td>
                    <td><strong>{formatNumber(row.score)}</strong></td>
                    <td>{row.lower === null || row.upper === null ? "-" : `${formatNumber(row.lower)} - ${formatNumber(row.upper)}`}</td>
                    <td>{formatPercent(row.coverage)}</td>
                    <td>{formatInteger(row.compliant)}</td>
                    <td>{formatInteger(row.violation)}</td>
                    <td><SourceButton path={row.sourcePath} label="requirement_estimates.csv" onOpenSource={onOpenSource} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function AvailabilityDetailView({ analysis, profile, onOpenSource }: DetailProps)
{
  const scenarios = analysis.availabilityScenarios
    .filter((row) => row.subjectId === profile.subjectId)
    .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  const interval = analysis.availabilityIntervals.find((row) => row.subjectId === profile.subjectId) ?? null;
  const failureModes = analysis.availabilityFailureModes.filter((row) => row.subjectId === null || row.subjectId === profile.subjectId);

  const totalRetries = scenarios.reduce((sum, row) => sum + (row.retriedSlots ?? 0), 0);
  const recoveredRetries = scenarios.reduce((sum, row) => sum + (row.recoveredByRetrySlots ?? 0), 0);
  const firstAttemptAvailable = scenarios.reduce((sum, row) => sum + ((row.firstAttemptAvailability ?? 0) * (row.plannedSlots ?? 0)), 0);
  const planned = scenarios.reduce((sum, row) => sum + (row.plannedSlots ?? 0), 0);
  const firstAttemptFraction = planned > 0 ? firstAttemptAvailable / planned : null;

  return (
    <section className="analysis-detail-section">
      <div className="detail-section-heading">
        <div>
          <p className="eyebrow">Availability</p>
          <h3>Execution availability by scenario</h3>
          <p>Final validity, first-attempt availability, and retry recovery from exported availability tables.</p>
        </div>
      </div>

      <div className="detail-stat-grid">
        <div><span>Final availability</span><strong>{formatPercent(profile.availability)}</strong></div>
        <div><span>First attempt</span><strong>{formatPercent(firstAttemptFraction)}</strong></div>
        <div><span>Retried slots</span><strong>{totalRetries.toLocaleString()}</strong></div>
        <div><span>Recovered retries</span><strong>{recoveredRetries.toLocaleString()}</strong></div>
        <div><span>Interval</span><strong>{interval?.lower === null || interval?.lower === undefined || interval.upper === null ? interval?.intervalStatus ?? "-" : `${formatPercent(interval.lower)} - ${formatPercent(interval.upper)}`}</strong></div>
      </div>

      {scenarios.length > 0 ? (
        <>
          <div className="detail-chart-card"><AvailabilityScenarioChart scenarios={scenarios} /></div>
          <div className="detail-table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Planned</th>
                  <th>Final available</th>
                  <th>Availability</th>
                  <th>First attempt</th>
                  <th>Retried</th>
                  <th>Recovered</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((row) => (
                  <tr key={row.scenarioId}>
                    <th>{row.scenarioId}</th>
                    <td>{formatInteger(row.plannedSlots)}</td>
                    <td>{formatInteger(row.availableValidSlots)}</td>
                    <td><strong>{formatPercent(row.availability)}</strong></td>
                    <td>{formatPercent(row.firstAttemptAvailability)}</td>
                    <td>{formatInteger(row.retriedSlots)}</td>
                    <td>{formatInteger(row.recoveredByRetrySlots)}</td>
                    <td><SourceButton path={row.sourcePath} label="availability_cells.csv" onOpenSource={onOpenSource} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <div className="detail-empty">No scenario-level availability table is available.</div>}

      <div className="detail-subsection">
        <div className="detail-subsection-heading">
          <h4>Unavailable-slot failure modes</h4>
          {failureModes.length > 0 && <SourceButton path={failureModes[0].sourcePath} label="availability_failure_modes.csv" onOpenSource={onOpenSource} />}
        </div>
        {failureModes.length === 0 ? (
          <div className="detail-empty detail-empty-compact">No unavailable-slot failure modes were recorded for this subject.</div>
        ) : (
          <div className="detail-table-wrap detail-table-wrap-compact">
            <table className="detail-table">
              <thead><tr><th>Termination</th><th>Failure kind</th><th>Unavailable slots</th><th>Scope unavailable</th></tr></thead>
              <tbody>{failureModes.map((row, index) => (
                <tr key={`${row.finalTermination}-${row.failureKind}-${index}`}>
                  <th>{row.finalTermination || "-"}</th><td>{row.failureKind || "-"}</td><td>{formatInteger(row.unavailableSlots)}</td><td>{formatPercent(row.fractionUnavailable)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export function TrajectoryDetailView({ analysis, profile, onOpenSource }: DetailProps)
{
  const summary = analysis.trajectorySummaries.find((row) => row.subjectId === profile.subjectId) ?? null;
  const tools = analysis.trajectoryToolUsage.filter((row) => row.subjectId === profile.subjectId);
  const runs = analysis.trajectoryRunMetrics.filter((row) => row.subjectId === profile.subjectId);

  if (summary === null && tools.length === 0 && runs.length === 0)
  {
    return (
      <section className="analysis-detail-section">
        <div className="detail-section-heading">
          <div>
            <p className="eyebrow">Trajectory</p>
            <h3>Tool-use trajectory</h3>
            <p>This analysis does not contain exported trajectory tables. Nothing is synthesized from raw run data.</p>
          </div>
        </div>
        <div className="detail-empty">Trajectory analysis is not available in this analysis snapshot.</div>
      </section>
    );
  }

  return (
    <section className="analysis-detail-section">
      <div className="detail-section-heading">
        <div>
          <p className="eyebrow">Trajectory</p>
          <h3>Tool-use trajectory</h3>
          <p>Exported tool-use summaries and run-level trajectory metrics for the selected subject.</p>
        </div>
        {summary !== null && <SourceButton path={summary.sourcePath} label="trajectory_subject_summary.csv" onOpenSource={onOpenSource} />}
      </div>

      <div className="detail-stat-grid detail-stat-grid-wide">
        <div><span>Selected runs</span><strong>{formatInteger(summary?.selectedRuns ?? null)}</strong></div>
        <div><span>Total calls</span><strong>{formatInteger(summary?.totalToolCalls ?? null)}</strong></div>
        <div><span>Mean calls/run</span><strong>{formatNumber(summary?.meanToolCallsPerRun ?? null, 2)}</strong></div>
        <div><span>Median calls/run</span><strong>{formatNumber(summary?.medianToolCallsPerRun ?? null, 2)}</strong></div>
        <div><span>Distinct tools</span><strong>{formatInteger(summary?.totalDistinctToolNames ?? null)}</strong></div>
        <div><span>Error rate</span><strong>{formatPercent(summary?.errorRate ?? null)}</strong></div>
        <div><span>Repeated calls</span><strong>{formatInteger(summary?.repeatedCalls ?? null)}</strong></div>
        <div><span>Unmatched calls</span><strong>{formatInteger(summary?.unmatchedCalls ?? null)}</strong></div>
      </div>

      <div className="detail-two-column">
        <section className="detail-chart-card">
          <div className="detail-card-heading"><h4>Most used tools</h4><span>Top 12 by call count</span></div>
          {tools.length > 0 ? <ToolUsageChart rows={tools} /> : <div className="detail-empty">No tool-usage table is available.</div>}
        </section>
        <section className="detail-chart-card">
          <div className="detail-card-heading"><h4>Run-level tool calls</h4><span>Each point is one selected run</span></div>
          {runs.length > 0 ? <RunTrajectoryChart rows={runs} /> : <div className="detail-empty">No run-level trajectory table is available.</div>}
        </section>
      </div>

      {tools.length > 0 && (
        <div className="detail-table-wrap">
          <table className="detail-table">
            <thead><tr><th>Tool</th><th>Calls</th><th>Runs using</th><th>Run share</th><th>Error results</th><th>Error rate</th><th>Source</th></tr></thead>
            <tbody>{[...tools].sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0)).map((row) => (
              <tr key={row.toolName}>
                <th>{row.toolName}</th><td>{formatInteger(row.calls)}</td><td>{formatInteger(row.runsUsingTool)}</td><td>{formatPercent(row.runShare)}</td><td>{formatInteger(row.errorResults)}</td><td>{formatPercent(row.errorRate)}</td><td><SourceButton path={row.sourcePath} label="trajectory_tool_usage.csv" onOpenSource={onOpenSource} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
