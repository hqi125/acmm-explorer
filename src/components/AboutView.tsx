export function AboutView()
{
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">About</p>
          <h1>Project scope and data rules.</h1>
        </div>
        <p>
          ACMM Explorer is a local read-only interface for generated experiment outputs and ACMM
          usage information. It is separate from the frozen experiment infrastructure.
        </p>
      </section>

      <section className="about-grid">
        <article className="about-card">
          <span className="large-index">01</span>
          <h2>Use canonical values when available.</h2>
          <p>Existing ACMM measurements should be displayed directly rather than reimplemented in the frontend.</p>
        </article>
        <article className="about-card">
          <span className="large-index">02</span>
          <h2>Keep display derivations traceable.</h2>
          <p>Aggregations, filters, and chart coordinates should expose their inputs and provenance.</p>
        </article>
        <article className="about-card">
          <span className="large-index">03</span>
          <h2>Separate new analytical methods.</h2>
          <p>Any future interpretation that changes the research model should be explicitly identified as additional analysis.</p>
        </article>
      </section>
    </div>
  );
}
