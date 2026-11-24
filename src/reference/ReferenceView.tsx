import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { referenceEntries, referenceEntryById, type ReferenceEntry, type ReferenceKind } from "./catalog";

const kindOptions: Array<"All" | ReferenceKind> = ["All", "Command", "Schema", "Concept"];

function matchesQuery(entry: ReferenceEntry, query: string)
{
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0)
  {
    return true;
  }

  const searchable = [
    entry.kind,
    entry.name,
    entry.summary,
    entry.sourceLabel,
    entry.purpose ?? "",
    entry.whenToUse ?? "",
    ...(entry.aliases ?? []),
    ...(entry.syntax ?? []),
    ...(entry.fields ?? []).flatMap((field) => [field.name, field.description ?? ""]),
  ].join(" ").toLowerCase();

  return searchable.includes(normalized);
}

function sourceTone(entry: ReferenceEntry)
{
  if (entry.sourceStatus === "observed-export")
  {
    return "observed";
  }
  if (entry.sourceStatus === "explorer-local")
  {
    return "local";
  }
  return "context";
}

async function copyText(value: string)
{
  await navigator.clipboard.writeText(value);
}

export function ReferenceView()
{
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"All" | ReferenceKind>("All");
  const [selectedId, setSelectedId] = useState(referenceEntries[0]?.id ?? "");
  const [copied, setCopied] = useState<string | null>(null);

  const filteredEntries = useMemo(() => referenceEntries.filter((entry) =>
    (kind === "All" || entry.kind === kind) && matchesQuery(entry, query)), [kind, query]);

  const selectedEntry = referenceEntryById.get(selectedId) ?? filteredEntries[0] ?? referenceEntries[0];

  useEffect(() =>
  {
    if (filteredEntries.length > 0 && !filteredEntries.some((entry) => entry.id === selectedId))
    {
      setSelectedId(filteredEntries[0].id);
    }
  }, [filteredEntries, selectedId]);

  const counts = useMemo(() => ({
    all: referenceEntries.length,
    commands: referenceEntries.filter((entry) => entry.kind === "Command").length,
    schemas: referenceEntries.filter((entry) => entry.kind === "Schema").length,
    concepts: referenceEntries.filter((entry) => entry.kind === "Concept").length,
    observed: referenceEntries.filter((entry) => entry.sourceStatus === "observed-export").length,
  }), []);

  const handleCopy = async (label: string, value: string) =>
  {
    try
    {
      await copyText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => current === label ? null : current), 1400);
    }
    catch
    {
      setCopied(null);
    }
  };

  const selectRelated = (id: string) =>
  {
    const entry = referenceEntryById.get(id);
    if (!entry)
    {
      return;
    }
    setQuery("");
    setKind("All");
    setSelectedId(id);
  };

  return (
    <div className="page-stack">
      <section className="page-intro reference-intro">
        <div>
          <p className="eyebrow">Reference</p>
          <h1>ACMM lookup.</h1>
        </div>
        <p>
          Search project commands, analyzed export schemas, and working concepts. Entries derived
          from observed exports are separated from project-context notes while frozen-source schema
          harvesting remains pending.
        </p>
      </section>

      <section className="reference-summary-grid" aria-label="Reference catalog summary">
        <div><span>Entries</span><strong>{counts.all}</strong></div>
        <div><span>Commands</span><strong>{counts.commands}</strong></div>
        <div><span>Schemas</span><strong>{counts.schemas}</strong></div>
        <div><span>Concepts</span><strong>{counts.concepts}</strong></div>
        <div><span>Observed export</span><strong>{counts.observed}</strong></div>
      </section>

      <section className="reference-shell reference-workspace">
        <div className="reference-browser">
          <div className="reference-search-wrap">
            <label htmlFor="reference-search">Search reference</label>
            <input
              id="reference-search"
              className="reference-search"
              type="search"
              value={query}
              placeholder="dimension_scores, campaign, recovery..."
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            />
          </div>

          <div className="reference-kind-filter" aria-label="Reference kind filter">
            {kindOptions.map((option) => (
              <button
                className={`filter-chip ${kind === option ? "active" : ""}`}
                key={option}
                type="button"
                onClick={() => setKind(option)}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="reference-results-heading">
            <span>{filteredEntries.length} matching entries</span>
            <span>{query.trim().length > 0 ? `Search: ${query.trim()}` : "Structured catalog"}</span>
          </div>

          <div className="reference-list reference-list-compact">
            {filteredEntries.map((entry) => (
              <button
                className={`reference-entry reference-entry-button ${selectedEntry?.id === entry.id ? "selected" : ""}`}
                key={entry.id}
                type="button"
                onClick={() => setSelectedId(entry.id)}
              >
                <span className={`kind-badge kind-${entry.kind.toLowerCase()}`}>{entry.kind}</span>
                <span className="reference-entry-copy">
                  <strong>{entry.name}</strong>
                  <small>{entry.summary}</small>
                </span>
                <span className={`source-dot source-${sourceTone(entry)}`} title={entry.sourceLabel} />
              </button>
            ))}
            {filteredEntries.length === 0 && (
              <div className="empty-state">
                <strong>No matching entries.</strong>
                <span>Try a filename, field, command, concept, or alias.</span>
              </div>
            )}
          </div>
        </div>

        {selectedEntry && (
          <article className="reference-detail" aria-live="polite">
            <div className="reference-detail-heading">
              <div>
                <div className="reference-detail-badges">
                  <span className={`kind-badge kind-${selectedEntry.kind.toLowerCase()}`}>{selectedEntry.kind}</span>
                  <span className={`source-badge source-${sourceTone(selectedEntry)}`}>{selectedEntry.sourceLabel}</span>
                </div>
                <h2>{selectedEntry.name}</h2>
                <p>{selectedEntry.summary}</p>
              </div>
            </div>

            <div className="reference-source-note">
              <strong>Source basis</strong>
              <span>{selectedEntry.sourceNote}</span>
            </div>

            {selectedEntry.purpose && (
              <section className="reference-detail-section">
                <h3>Purpose</h3>
                <p>{selectedEntry.purpose}</p>
              </section>
            )}

            {selectedEntry.whenToUse && (
              <section className="reference-detail-section">
                <h3>When to use</h3>
                <p>{selectedEntry.whenToUse}</p>
              </section>
            )}

            {selectedEntry.syntax && selectedEntry.syntax.length > 0 && (
              <section className="reference-detail-section">
                <h3>Syntax</h3>
                <div className="reference-code-list">
                  {selectedEntry.syntax.map((line) => (
                    <div className="reference-code-row" key={line}>
                      <code>{line}</code>
                      <button type="button" onClick={() => handleCopy(line, line)}>{copied === line ? "Copied" : "Copy"}</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selectedEntry.fields && selectedEntry.fields.length > 0 && (
              <section className="reference-detail-section">
                <div className="reference-section-heading">
                  <h3>Observed fields</h3>
                  <span>{selectedEntry.fields.length}</span>
                </div>
                <div className="reference-field-list">
                  {selectedEntry.fields.map((field) => (
                    <div className="reference-field-row" key={field.name}>
                      <button type="button" onClick={() => handleCopy(field.name, field.name)}>
                        <code>{field.name}</code>
                      </button>
                      <span>{field.description ?? "Observed field; detailed frozen-schema definition pending source import."}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selectedEntry.notes && selectedEntry.notes.length > 0 && (
              <section className="reference-detail-section">
                <h3>Notes</h3>
                <ul className="reference-notes">
                  {selectedEntry.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </section>
            )}

            {selectedEntry.related && selectedEntry.related.length > 0 && (
              <section className="reference-detail-section">
                <h3>Related</h3>
                <div className="reference-related-list">
                  {selectedEntry.related.map((id) =>
                  {
                    const related = referenceEntryById.get(id);
                    if (!related)
                    {
                      return null;
                    }
                    return (
                      <button type="button" key={id} onClick={() => selectRelated(id)}>
                        <span className={`kind-badge kind-${related.kind.toLowerCase()}`}>{related.kind}</span>
                        {related.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </article>
        )}
      </section>
    </div>
  );
}
