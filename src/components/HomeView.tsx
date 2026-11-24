import type { AppView } from "../app/navigation";
import { ComplianceRadar } from "../visualization/ComplianceRadar";

interface HomeViewProps
{
  onNavigate: (view: AppView) => void;
}

const profileRows = [
  ["Goal", "0.84", "+0.04"],
  ["Obligation", "0.78", "+0.02"],
  ["Boundary", "0.91", "+0.05"],
  ["Procedure", "0.72", "-0.01"],
  ["Fidelity", "0.86", "+0.03"],
  ["Recovery", "0.67", "+0.07"],
];

export function HomeView({ onNavigate }: HomeViewProps)
{
  return (
    <div className="page-stack">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">ACMM Explorer</p>
          <h1>Experiment data viewer and usage reference.</h1>
          <p className="hero-lead">
            Open generated ACMM data for inspection, compare agent results, and look up commands,
            schemas, and project concepts from one local interface.
          </p>
          <div className="hero-actions">
            <button className="button button-primary" type="button" onClick={() => onNavigate("explorer")}>
              Open data explorer
            </button>
            <button className="button button-secondary" type="button" onClick={() => onNavigate("reference")}>
              Open reference
            </button>
          </div>
          <div className="principle-strip">
            <div>
              <span>Data</span>
              <strong>Local processing</strong>
              <small>One accepted export is retained in local browser storage for reuse across views.</small>
            </div>
            <div>
              <span>Traceability</span>
              <strong>Source-linked views</strong>
              <small>Displayed values should remain traceable to source observations.</small>
            </div>
            <div>
              <span>Scope</span>
              <strong>Read-only use</strong>
              <small>The explorer consumes outputs without modifying ACMM experiment infrastructure.</small>
            </div>
          </div>
        </div>

        <article className="profile-card">
          <div className="card-heading-row">
            <div>
              <p className="eyebrow">Example profile</p>
              <h2>Example agent</h2>
            </div>
            <span className="tag tag-muted">Demo data</span>
          </div>
          <ComplianceRadar />
          <div className="profile-table" aria-label="Example compliance profile values">
            {profileRows.map(([name, value, delta]) => (
              <div className="profile-row" key={name}>
                <span>{name}</span>
                <strong>{value}</strong>
                <small className={delta.startsWith("-") ? "delta-negative" : "delta-positive"}>{delta}</small>
              </div>
            ))}
          </div>
          <p className="demo-note">
            Synthetic values are used until a package adapter can load and trace real experiment observations.
          </p>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>Data inspection and project reference.</h2>
          </div>
          <p>
            These areas are separate for now. As real package and schema support is added, data views
            can link directly to relevant field and command documentation.
          </p>
        </div>

        <div className="feature-grid">
          <button className="feature-card feature-card-dark" type="button" onClick={() => onNavigate("explorer")}>
            <span className="feature-index">Data</span>
            <div>
              <h3>Experiment data</h3>
              <p>Load outputs, inspect agent profiles, compare scenarios, and drill down to run-level evidence.</p>
            </div>
            <span className="feature-link">Open explorer</span>
          </button>
          <button className="feature-card" type="button" onClick={() => onNavigate("reference")}>
            <span className="feature-index">Docs</span>
            <div>
              <h3>Usage reference</h3>
              <p>Look up schema fields, CLI options, project concepts, defaults, examples, and source information.</p>
            </div>
            <span className="feature-link">Open reference</span>
          </button>
        </div>
      </section>
    </div>
  );
}
