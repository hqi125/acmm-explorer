import { useMemo, useState, type ChangeEvent } from "react";

type ReferenceKind = "Command" | "Schema" | "Concept";

interface ReferenceEntry
{
  kind: ReferenceKind;
  name: string;
  summary: string;
  status: "placeholder" | "planned";
}

const entries: ReferenceEntry[] = [
  {
    kind: "Command",
    name: "acmm run",
    summary: "Single-run execution entry point. Exact options will be imported from frozen Core sources.",
    status: "placeholder",
  },
  {
    kind: "Command",
    name: "acmm campaign execute",
    summary: "Durable campaign execution entry point with package and execution controls.",
    status: "placeholder",
  },
  {
    kind: "Schema",
    name: "provider_pressure",
    summary: "Provider pressure configuration and telemetry fields. Source-linked definitions are pending import.",
    status: "planned",
  },
  {
    kind: "Concept",
    name: "GOBPFR",
    summary: "Goal, Obligation, Boundary, Procedure, Fidelity, and Recovery compliance profile dimensions.",
    status: "placeholder",
  },
  {
    kind: "Concept",
    name: "Evaluability boundary",
    summary: "Validity principle used to separate behavior signals from apparatus invalidation.",
    status: "planned",
  },
];

export function ReferenceView()
{
  const [query, setQuery] = useState("");

  const filteredEntries = useMemo(() =>
  {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0)
    {
      return entries;
    }

    return entries.filter((entry) =>
      `${entry.kind} ${entry.name} ${entry.summary}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Reference</p>
          <h1>Commands, schemas, and concepts.</h1>
        </div>
        <p>
          Search ACMM usage information in one place. The current entries are placeholders until
          command and schema metadata are imported from the frozen source repositories.
        </p>
      </section>

      <section className="reference-shell">
        <div className="reference-search-wrap">
          <label htmlFor="reference-search">Search commands, fields, and concepts</label>
          <input
            id="reference-search"
            className="reference-search"
            type="search"
            value={query}
            placeholder="campaign, GOBPFR, provider..."
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          />
        </div>

        <div className="reference-results-heading">
          <span>{filteredEntries.length} entries</span>
          <span className="tag tag-muted">Placeholder data</span>
        </div>

        <div className="reference-list">
          {filteredEntries.map((entry) => (
            <article className="reference-entry" key={`${entry.kind}-${entry.name}`}>
              <span className={`kind-badge kind-${entry.kind.toLowerCase()}`}>{entry.kind}</span>
              <div>
                <h2>{entry.name}</h2>
                <p>{entry.summary}</p>
              </div>
              <span className="entry-status">{entry.status}</span>
            </article>
          ))}
          {filteredEntries.length === 0 && (
            <div className="empty-state">
              <strong>No matching entries.</strong>
              <span>The reference catalog currently contains placeholder content only.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
