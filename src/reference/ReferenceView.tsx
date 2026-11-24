import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { referenceEntries, referenceEntryById, schemaCatalogInfo, type ReferenceEntry, type ReferenceKind } from "./catalog";

type ReferenceFilter = "All" | ReferenceKind;

const filterOptions: Array<{ value: ReferenceFilter; label: string }> = [
  { value: "All", label: "All" },
  { value: "Command", label: "Command" },
  { value: "Schema", label: "JSON Schema" },
  { value: "Artifact", label: "Data Artifact" },
  { value: "Field", label: "Field" },
  { value: "Concept", label: "Concept" },
];

interface ReferenceHistoryMarker
{
  session: string;
  index: number;
  id: string;
}

interface ReferenceWindowState
{
  acmmReference?: ReferenceHistoryMarker;
  [key: string]: unknown;
}

const referenceHashPrefix = "#/reference/";

function referenceHash(id: string)
{
  return `${referenceHashPrefix}${encodeURIComponent(id)}`;
}

function referenceIdFromLocation()
{
  if (!window.location.hash.startsWith(referenceHashPrefix))
  {
    return null;
  }

  try
  {
    const id = decodeURIComponent(window.location.hash.slice(referenceHashPrefix.length));
    return referenceEntryById.has(id) ? id : null;
  }
  catch
  {
    return null;
  }
}

function initialReferenceId()
{
  return referenceIdFromLocation() ?? referenceEntries[0]?.id ?? "";
}

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
    ...(entry.metadata ?? []).flatMap((item) => [item.label, item.value]),
  ].join(" ").toLowerCase();

  return searchable.includes(normalized);
}

function displayKind(entry: ReferenceEntry)
{
  if (entry.kind === "Schema")
  {
    return "JSON Schema";
  }
  if (entry.kind === "Artifact")
  {
    return "Data Artifact";
  }
  return entry.kind;
}

function kindClass(entry: ReferenceEntry)
{
  if (entry.kind === "Artifact")
  {
    return "artifact";
  }
  return entry.kind.toLowerCase();
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
  if (entry.sourceStatus === "generated-schema")
  {
    return "generated";
  }
  return "context";
}

async function copyText(value: string)
{
  await navigator.clipboard.writeText(value);
}

export function ReferenceView()
{
  const initialId = useRef(initialReferenceId()).current;
  const historySession = useRef(`reference-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ReferenceFilter>("All");
  const [selectedId, setSelectedId] = useState(initialId);
  const [copied, setCopied] = useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyMax, setHistoryMax] = useState(0);

  const filteredEntries = useMemo(() => referenceEntries.filter((entry) =>
    (kind === "All" || entry.kind === kind) && matchesQuery(entry, query)), [kind, query]);

  const selectedEntry = referenceEntryById.get(selectedId) ?? referenceEntries[0];

  useEffect(() =>
  {
    if (!initialId)
    {
      return undefined;
    }

    const currentState = (window.history.state ?? {}) as ReferenceWindowState;
    const initialMarker: ReferenceHistoryMarker = {
      session: historySession.current,
      index: 0,
      id: initialId,
    };
    window.history.replaceState(
      { ...currentState, acmmReference: initialMarker },
      "",
      referenceHash(initialId),
    );

    const handlePopState = (event: PopStateEvent) =>
    {
      const routeId = referenceIdFromLocation();
      if (!routeId)
      {
        return;
      }

      setSelectedId(routeId);
      const marker = (event.state as ReferenceWindowState | null)?.acmmReference;
      if (marker?.session === historySession.current)
      {
        setHistoryIndex(marker.index);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialId]);

  const counts = useMemo(() => ({
    all: referenceEntries.length,
    commands: referenceEntries.filter((entry) => entry.kind === "Command").length,
    schemas: referenceEntries.filter((entry) => entry.kind === "Schema").length,
    artifacts: referenceEntries.filter((entry) => entry.kind === "Artifact").length,
    fields: referenceEntries.filter((entry) => entry.kind === "Field").length,
    concepts: referenceEntries.filter((entry) => entry.kind === "Concept").length,
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

  const navigateToEntry = (id: string) =>
  {
    const entry = referenceEntryById.get(id);
    if (!entry || id === selectedId)
    {
      return;
    }

    const nextIndex = historyIndex + 1;
    const state = (window.history.state ?? {}) as ReferenceWindowState;
    window.history.pushState(
      {
        ...state,
        acmmReference: {
          session: historySession.current,
          index: nextIndex,
          id,
        },
      },
      "",
      referenceHash(id),
    );
    setSelectedId(id);
    setHistoryIndex(nextIndex);
    setHistoryMax(nextIndex);
  };

  const copyCurrentLink = async () =>
  {
    if (!selectedEntry)
    {
      return;
    }
    const link = `${window.location.origin}${window.location.pathname}${window.location.search}${referenceHash(selectedEntry.id)}`;
    await handleCopy("reference-link", link);
  };

  return (
    <div className="page-stack">
      <section className="page-intro reference-intro">
        <div>
          <p className="eyebrow">Reference</p>
          <h1>ACMM lookup.</h1>
        </div>
        <p>
          Search commands, source-derived JSON Schema definitions and fields, observed data artifacts,
          and working concepts. Each entry has its own addressable detail route; Back and Forward preserve
          reference navigation without mixing generated schema definitions with observed CSV/YAML structures.
        </p>
      </section>

      <section className="reference-summary-grid" aria-label="Reference catalog summary">
        <div><span>Entries</span><strong>{counts.all}</strong></div>
        <div><span>Commands</span><strong>{counts.commands}</strong></div>
        <div><span>JSON Schemas</span><strong>{counts.schemas}</strong></div>
        <div><span>Artifacts</span><strong>{counts.artifacts}</strong></div>
        <div><span>Fields</span><strong>{counts.fields}</strong></div>
        <div><span>Concepts</span><strong>{counts.concepts}</strong></div>
      </section>

      <section className="reference-catalog-provenance" aria-label="Generated schema catalog status">
        <div>
          <span className="eyebrow">Source-generated schema catalog</span>
          <strong>{schemaCatalogInfo.schemaCount} schemas / {schemaCatalogInfo.fieldCount} fields</strong>
          <small>{schemaCatalogInfo.generatedAt ? `Generated ${new Date(schemaCatalogInfo.generatedAt).toLocaleString()}` : "No source catalog generated in this checkout yet."}</small>
        </div>
        <div className="reference-source-chips">
          {schemaCatalogInfo.sources.length > 0 ? schemaCatalogInfo.sources.map((source) => (
            <span key={source.id}>
              <strong>{source.label}</strong>
              <code>{source.commit ? source.commit.slice(0, 12) : "commit unavailable"}</code>
              <small>{source.schemaCount} schemas / {source.fieldCount} fields</small>
            </span>
          )) : (
            <span><small>Run <code>./scripts/reference-import.sh</code> with the sibling source repositories available.</small></span>
          )}
        </div>
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
            {filterOptions.map((option) => (
              <button
                className={`filter-chip ${kind === option.value ? "active" : ""}`}
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
              >
                {option.label}
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
                onClick={() => navigateToEntry(entry.id)}
              >
                <span className={`kind-badge kind-${kindClass(entry)}`}>{displayKind(entry)}</span>
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
            <div className="reference-detail-nav" aria-label="Reference history">
              <div>
                <button type="button" disabled={historyIndex <= 0} onClick={() => window.history.back()}>Back</button>
                <button type="button" disabled={historyIndex >= historyMax} onClick={() => window.history.forward()}>Forward</button>
              </div>
              <button type="button" onClick={() => void copyCurrentLink()}>
                {copied === "reference-link" ? "Link copied" : "Copy link"}
              </button>
            </div>

            <div className="reference-detail-heading">
              <div>
                <div className="reference-detail-badges">
                  <span className={`kind-badge kind-${kindClass(selectedEntry)}`}>{displayKind(selectedEntry)}</span>
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
                      <button type="button" onClick={() => void handleCopy(line, line)}>{copied === line ? "Copied" : "Copy"}</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selectedEntry.metadata && selectedEntry.metadata.length > 0 && (
              <section className="reference-detail-section">
                <h3>Definition</h3>
                <div className="reference-metadata-grid">
                  {selectedEntry.metadata.map((item) => (
                    <div key={`${item.label}:${item.value}`}>
                      <span>{item.label}</span>
                      <div>
                        <code>{item.value}</code>
                        <button type="button" onClick={() => void handleCopy(`${item.label}:${item.value}`, item.value)}>
                          {copied === `${item.label}:${item.value}` ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selectedEntry.fields && selectedEntry.fields.length > 0 && (
              <section className="reference-detail-section">
                <div className="reference-section-heading">
                  <h3>{selectedEntry.kind === "Schema" ? "Schema fields" : "Observed fields"}</h3>
                  <span>{selectedEntry.fields.length}</span>
                </div>
                <div className="reference-field-list">
                  {selectedEntry.fields.map((field) => (
                    <div className="reference-field-row" key={`${field.name}:${field.entryId ?? "copy"}`}>
                      {field.entryId ? (
                        <button className="reference-field-link" type="button" onClick={() => navigateToEntry(field.entryId!)}>
                          <code>{field.name}</code>
                          <span>{field.description ?? "Open field details."}</span>
                        </button>
                      ) : (
                        <div className="reference-field-link reference-field-link-static">
                          <code>{field.name}</code>
                          <span>{field.description ?? "Field recorded by this reference entry."}</span>
                        </div>
                      )}
                      <button
                        className="reference-field-copy"
                        type="button"
                        title={`Copy ${field.name}`}
                        onClick={() => void handleCopy(`field:${field.name}`, field.name)}
                      >
                        {copied === `field:${field.name}` ? "Copied" : "Copy"}
                      </button>
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
                      <button type="button" key={id} onClick={() => navigateToEntry(id)}>
                        <span className={`kind-badge kind-${kindClass(related)}`}>{displayKind(related)}</span>
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
