export function AboutView()
{
  return (
    <div className="page-stack about-page">
      <section className="page-intro about-intro">
        <div>
          <p className="eyebrow">About</p>
          <h1>Local interface around frozen ACMM outputs.</h1>
        </div>
        <p>
          ACMM Explorer is a read-only side project for viewing analyzed experiment exports,
          applying explicit decision models, and browsing source-derived ACMM reference material.
        </p>
      </section>

      <section className="about-summary-grid">
        <article>
          <p className="eyebrow">Data lifecycle</p>
          <h2>One shared local export session.</h2>
          <p>The accepted ZIP is processed in the browser, optionally cached in one IndexedDB slot, and normalized once for use across Overview, Data Explorer, and Decision Workshop.</p>
        </article>
        <article>
          <p className="eyebrow">Evidence boundary</p>
          <h2>Canonical analysis stays canonical.</h2>
          <p>Exported ACMM measurements are displayed as evidence. The Decision Workshop applies separate user-defined preference functions and labels their results as conditional.</p>
        </article>
        <article>
          <p className="eyebrow">Reference source</p>
          <h2>Generated from frozen repositories.</h2>
          <p>Core JSON Schemas and experiment-package YAML structures are indexed from read-only sibling repositories into a local generated catalog with source provenance.</p>
        </article>
      </section>

      <section className="about-details">
        <div>
          <p className="eyebrow">Application boundaries</p>
          <h2>What this interface does and does not own.</h2>
        </div>
        <dl>
          <div><dt>Experiment execution</dt><dd>Not performed here. Explorer consumes exported analysis only.</dd></div>
          <div><dt>Raw run evidence</dt><dd>Outside the viewer scope; scientific report and ACMM infrastructure remain responsible for raw execution evidence.</dd></div>
          <div><dt>Visualization</dt><dd>Frontend charts are rendered independently from exported numeric analysis tables and remain traceable to those tables.</dd></div>
          <div><dt>Decision recipes</dt><dd>Stored locally and evaluated separately from the ACMM metric model.</dd></div>
          <div><dt>Network services</dt><dd>None required for normal use. The project is designed as a local-only interface.</dd></div>
        </dl>
      </section>
    </div>
  );
}
