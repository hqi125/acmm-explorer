import { useMemo } from "react";
import type { AppView } from "../app/navigation";
import { useExportSession } from "../data/session/ExportSession";
import { ComplianceMultiRadar } from "../visualization/ComplianceMultiRadar";

interface HomeViewProps
{
  onNavigate: (view: AppView) => void;
}

export function HomeView({ onNavigate }: HomeViewProps)
{
  const { dataset, selectedAnalysisId, busy, busyLabel, cacheInfo } = useExportSession();
  const activeAnalysis = useMemo(
    () => dataset?.analyses.find((analysis) => analysis.id === selectedAnalysisId) ?? null,
    [dataset, selectedAnalysisId],
  );

  return (
    <div className="page-stack overview-page">
      <section className="overview-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>ACMM experiment workspace.</h1>
          <p>
            Inspect exported analysis, apply explicit decision functions, and look up source-backed
            ACMM reference material from one local interface.
          </p>
        </div>
        <div className="overview-actions">
          <button className="button button-primary" type="button" onClick={() => onNavigate("explorer")}>Data Explorer</button>
          <button className="button button-secondary" type="button" onClick={() => onNavigate("reference")}>Reference</button>
        </div>
      </section>

      {busy && (
        <section className="overview-loading" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <div>
            <strong>{busyLabel}</strong>
            <small>The shared export session continues even if you navigate to another page.</small>
          </div>
        </section>
      )}

      {!busy && dataset === null && (
        <section className="overview-empty">
          <div>
            <p className="eyebrow">Active export</p>
            <h2>No experiment export is loaded.</h2>
            <p>Open an ACMM export in Data Explorer. One accepted package can be cached locally and restored across pages and refreshes.</p>
          </div>
          <button className="button button-primary" type="button" onClick={() => onNavigate("explorer")}>Open export</button>
        </section>
      )}

      {!busy && dataset !== null && activeAnalysis === null && (
        <section className="overview-empty">
          <div>
            <p className="eyebrow">Active export</p>
            <h2>{dataset.experimentId}</h2>
            <p>This export contains multiple analyses. Select the analysis to use in Data Explorer before opening profile views.</p>
          </div>
          <button className="button button-primary" type="button" onClick={() => onNavigate("explorer")}>Select analysis</button>
        </section>
      )}

      {!busy && dataset !== null && activeAnalysis !== null && (
        <section className="overview-data-grid">
          <article className="overview-export-card">
            <div>
              <p className="eyebrow">Active export</p>
              <h2>{dataset.experimentId}</h2>
              <p>{dataset.sourceKind === "campaign" ? "Campaign export" : "Run export"} / export schema {dataset.exportSchemaVersion}</p>
            </div>
            <dl className="overview-metadata">
              <div><dt>Analysis</dt><dd>{activeAnalysis.label}</dd></div>
              <div><dt>Plan schema</dt><dd>{activeAnalysis.planSchemaVersion ?? "legacy"}</dd></div>
              <div><dt>Subjects</dt><dd>{activeAnalysis.subjects.length}</dd></div>
              <div><dt>Profile</dt><dd>{activeAnalysis.profileEstimand} / {activeAnalysis.profileAggregationMethod} / {activeAnalysis.profileWeighting}</dd></div>
              <div><dt>Cached package</dt><dd>{cacheInfo === null ? "No" : "Yes"}</dd></div>
            </dl>
            <div className="overview-card-actions">
              <button className="text-button" type="button" onClick={() => onNavigate("explorer")}>Inspect analysis</button>
              <button className="text-button" type="button" onClick={() => onNavigate("workshop")}>Open Decision Workshop</button>
            </div>
          </article>

          <article className="overview-radar-card">
            <div className="card-heading-row">
              <div>
                <p className="eyebrow">Canonical profile</p>
                <h2>Merged compliance profiles</h2>
              </div>
              <span className="tag tag-muted">{activeAnalysis.subjects.length} agents</span>
            </div>
            <ComplianceMultiRadar profiles={activeAnalysis.profiles} />
            <p className="overview-chart-note">Point-estimate GOBPFR profiles from the selected exported analysis. Decision functions do not modify this chart.</p>
          </article>
        </section>
      )}

      <section className="overview-tools">
        <button type="button" onClick={() => onNavigate("explorer")}>
          <span>Inspect</span>
          <strong>Data Explorer</strong>
          <small>Profiles, requirements, availability, trajectory, files, and provenance.</small>
        </button>
        <button type="button" onClick={() => onNavigate("workshop")}>
          <span>Decide</span>
          <strong>Decision Workshop</strong>
          <small>Apply persisted decision recipes without changing canonical ACMM evidence.</small>
        </button>
        <button type="button" onClick={() => onNavigate("reference")}>
          <span>Lookup</span>
          <strong>Reference</strong>
          <small>Browse Core JSON Schemas, experiment package YAML, artifacts, fields, and concepts.</small>
        </button>
      </section>
    </div>
  );
}
