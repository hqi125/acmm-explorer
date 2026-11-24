import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { referenceEntries, referenceEntryById, schemaCatalogInfo, type ReferenceEntry } from "./catalog";

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

interface ReferenceTreeNode
{
  id: string;
  label: string;
  type: "group" | "entry";
  entryId?: string;
  children: ReferenceTreeNode[];
}

interface ReferenceSearchOptions
{
  namesAndPathsOnly: boolean;
  excludedFiles: string[];
  excludedRoots: Set<string>;
}

const referenceRoots = ["Project reference", "Experiments", "Explorer"] as const;

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

function metadataValue(entry: ReferenceEntry, label: string)
{
  return entry.metadata?.find((item) => item.label === label)?.value ?? "";
}

function entryNavigationRoot(entry: ReferenceEntry)
{
  let current: ReferenceEntry | undefined = entry;
  const seen = new Set<string>();

  while (current)
  {
    if (current.navigationGroup && current.navigationGroup.length > 0)
    {
      return current.navigationGroup[0];
    }
    if (!current.navigationParentId || seen.has(current.navigationParentId))
    {
      break;
    }
    seen.add(current.navigationParentId);
    current = referenceEntryById.get(current.navigationParentId);
  }

  return "Other";
}

function matchesQuery(entry: ReferenceEntry, query: string, options: ReferenceSearchOptions)
{
  if (options.excludedRoots.has(entryNavigationRoot(entry)))
  {
    return false;
  }

  const sourceFile = metadataValue(entry, "Source file").toLowerCase();
  if (options.excludedFiles.some((term) => sourceFile.includes(term)))
  {
    return false;
  }

  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0)
  {
    return true;
  }

  const searchable = options.namesAndPathsOnly ? [
    entry.name,
    ...(entry.aliases ?? []),
    metadataValue(entry, "Canonical path"),
    metadataValue(entry, "YAML path"),
    metadataValue(entry, "Source file"),
    metadataValue(entry, "JSON pointer"),
  ].join(" ").toLowerCase() : [
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
  if (entry.kind === "Package")
  {
    return "Experiment Package";
  }
  if (entry.kind === "Yaml")
  {
    return "Package YAML";
  }
  return entry.kind;
}


function kindClass(entry: ReferenceEntry)
{
  if (entry.kind === "Artifact")
  {
    return "artifact";
  }
  if (entry.kind === "Yaml")
  {
    return "yaml";
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
  if (entry.sourceStatus === "generated-package")
  {
    return "package";
  }
  return "context";
}

function groupNodeId(parts: string[])
{
  return `group:${parts.map((part) => encodeURIComponent(part)).join("/")}`;
}

function entryNodeId(id: string)
{
  return `entry:${id}`;
}

function sortTree(nodes: ReferenceTreeNode[])
{
  nodes.sort((left, right) =>
  {
    if (left.type !== right.type)
    {
      return left.type === "group" ? -1 : 1;
    }
    return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" });
  });
  for (const node of nodes)
  {
    sortTree(node.children);
  }
}

function buildReferenceTree(entries: ReferenceEntry[])
{
  const root: ReferenceTreeNode = { id: "reference-root", label: "Reference", type: "group", children: [] };
  const groupNodes = new Map<string, ReferenceTreeNode>();
  const entryNodes = new Map<string, ReferenceTreeNode>();

  function ensureGroup(parts: string[])
  {
    let parent = root;
    const current: string[] = [];
    for (const part of parts)
    {
      current.push(part);
      const id = groupNodeId(current);
      let node = groupNodes.get(id);
      if (!node)
      {
        node = { id, label: part, type: "group", children: [] };
        groupNodes.set(id, node);
        parent.children.push(node);
      }
      parent = node;
    }
    return parent;
  }

  for (const entry of entries)
  {
    entryNodes.set(entry.id, {
      id: entryNodeId(entry.id),
      label: entry.name,
      type: "entry",
      entryId: entry.id,
      children: [],
    });
  }

  for (const entry of entries)
  {
    const node = entryNodes.get(entry.id)!;
    if (entry.navigationParentId && entryNodes.has(entry.navigationParentId))
    {
      entryNodes.get(entry.navigationParentId)!.children.push(node);
      continue;
    }

    const parent = ensureGroup(entry.navigationGroup ?? ["Other"]);
    parent.children.push(node);
  }

  sortTree(root.children);
  return root.children;
}

function entriesForQuery(query: string, options: ReferenceSearchOptions)
{
  const matches = referenceEntries.filter((entry) => matchesQuery(entry, query, options));
  const included = new Set(matches.map((entry) => entry.id));

  for (const match of matches)
  {
    let current = match;
    const seen = new Set<string>();
    while (current.navigationParentId && !seen.has(current.navigationParentId))
    {
      seen.add(current.navigationParentId);
      included.add(current.navigationParentId);
      const parent = referenceEntryById.get(current.navigationParentId);
      if (!parent)
      {
        break;
      }
      current = parent;
    }
  }

  return {
    entries: referenceEntries.filter((entry) => included.has(entry.id)),
    matchCount: matches.length,
  };
}

function expandableNodeIds(nodes: ReferenceTreeNode[])
{
  const ids: string[] = [];
  for (const node of nodes)
  {
    if (node.children.length > 0)
    {
      ids.push(node.id);
      ids.push(...expandableNodeIds(node.children));
    }
  }
  return ids;
}

function entryAncestorNodeIds(entryId: string)
{
  const ids = new Set<string>();
  let current = referenceEntryById.get(entryId);
  const seen = new Set<string>();

  while (current)
  {
    if (current.navigationParentId && !seen.has(current.navigationParentId))
    {
      seen.add(current.navigationParentId);
      ids.add(entryNodeId(current.navigationParentId));
      current = referenceEntryById.get(current.navigationParentId);
      continue;
    }

    const group = current.navigationGroup ?? ["Other"];
    const path: string[] = [];
    for (const part of group)
    {
      path.push(part);
      ids.add(groupNodeId(path));
    }
    break;
  }

  return ids;
}

function countTreeEntries(node: ReferenceTreeNode): number
{
  return (node.type === "entry" ? 1 : 0) + node.children.reduce((total, child) => total + countTreeEntries(child), 0);
}

async function copyText(value: string)
{
  await navigator.clipboard.writeText(value);
}

export function ReferenceView()
{
  const initialId = useRef(initialReferenceId()).current;
  const historySession = useRef(`reference-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [namesAndPathsOnly, setNamesAndPathsOnly] = useState(false);
  const [excludedFilesText, setExcludedFilesText] = useState("");
  const [excludedRoots, setExcludedRoots] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState(initialId);
  const [copied, setCopied] = useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyMax, setHistoryMax] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([
    groupNodeId(["Project reference"]),
    groupNodeId(["Experiments"]),
    groupNodeId(["Explorer"]),
  ]));

  const excludedFiles = useMemo(() => excludedFilesText
    .split(/[,\n]/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0), [excludedFilesText]);
  const searchOptions = useMemo<ReferenceSearchOptions>(() => ({
    namesAndPathsOnly,
    excludedFiles,
    excludedRoots,
  }), [namesAndPathsOnly, excludedFiles, excludedRoots]);
  const queryResult = useMemo(() => entriesForQuery(query, searchOptions), [query, searchOptions]);
  const tree = useMemo(() => buildReferenceTree(queryResult.entries), [queryResult.entries]);
  const selectedEntry = referenceEntryById.get(selectedId) ?? referenceEntries[0];
  const searchActive = query.trim().length > 0;
  const filterActive = searchActive || namesAndPathsOnly || excludedFiles.length > 0 || excludedRoots.size > 0;

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

  useEffect(() =>
  {
    if (!selectedId)
    {
      return;
    }
    const ancestorIds = entryAncestorNodeIds(selectedId);
    setExpanded((current) =>
    {
      const next = new Set(current);
      for (const id of ancestorIds)
      {
        next.add(id);
      }
      return next;
    });
  }, [selectedId]);

  const counts = useMemo(() => ({
    all: referenceEntries.length,
    commands: referenceEntries.filter((entry) => entry.kind === "Command").length,
    schemas: referenceEntries.filter((entry) => entry.kind === "Schema").length,
    packages: referenceEntries.filter((entry) => entry.kind === "Package").length,
    yaml: referenceEntries.filter((entry) => entry.kind === "Yaml").length,
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

  const toggleExpanded = (id: string) =>
  {
    setExpanded((current) =>
    {
      const next = new Set(current);
      if (next.has(id))
      {
        next.delete(id);
      }
      else
      {
        next.add(id);
      }
      return next;
    });
  };

  const toggleExcludedRoot = (root: string) =>
  {
    setExcludedRoots((current) =>
    {
      const next = new Set(current);
      if (next.has(root))
      {
        next.delete(root);
      }
      else
      {
        next.add(root);
      }
      return next;
    });
  };

  const clearAdvancedSearch = () =>
  {
    setNamesAndPathsOnly(false);
    setExcludedFilesText("");
    setExcludedRoots(new Set());
  };

  const fieldSearchKeyword = (entry: ReferenceEntry) =>
  {
    const path = metadataValue(entry, "Canonical path") || metadataValue(entry, "YAML path") || entry.name;
    const normalized = path.replace(/\[\]/g, "");
    const parts = normalized.split(/[./]/).filter((part) => part.length > 0);
    return parts.at(-1) ?? normalized;
  };

  const searchRelatedField = (entry: ReferenceEntry) =>
  {
    setQuery(fieldSearchKeyword(entry));
    setNamesAndPathsOnly(true);
    setExcludedFilesText("");
    setExcludedRoots(new Set());
    window.setTimeout(() =>
    {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
  };

  const renderTreeNodes = (nodes: ReferenceTreeNode[], level = 0): ReactNode[] => nodes.map((node) =>
  {
    const isOpen = searchActive || expanded.has(node.id);
    const hasChildren = node.children.length > 0;

    if (node.type === "group")
    {
      return (
        <div className="reference-tree-node" key={node.id}>
          <button
            className="reference-tree-row reference-tree-group"
            type="button"
            style={{ paddingLeft: `${10 + (level * 14)}px` }}
            onClick={() => toggleExpanded(node.id)}
          >
            <span className={`reference-tree-chevron ${isOpen ? "open" : ""}`}>{hasChildren ? ">" : ""}</span>
            <strong>{node.label}</strong>
            <small>{countTreeEntries(node)}</small>
          </button>
          {hasChildren && isOpen && (
            <div className="reference-tree-children">
              {renderTreeNodes(node.children, level + 1)}
            </div>
          )}
        </div>
      );
    }

    const entry = node.entryId ? referenceEntryById.get(node.entryId) : undefined;
    if (!entry)
    {
      return <div key={node.id} />;
    }

    return (
      <div className="reference-tree-node" key={node.id}>
        <div
          className={`reference-tree-row reference-tree-entry ${selectedEntry?.id === entry.id ? "selected" : ""}`}
          style={{ paddingLeft: `${10 + (level * 14)}px` }}
        >
          <button
            className="reference-tree-chevron-button"
            type="button"
            aria-label={hasChildren ? `${isOpen ? "Collapse" : "Expand"} ${entry.name}` : undefined}
            disabled={!hasChildren}
            onClick={() => hasChildren && toggleExpanded(node.id)}
          >
            <span className={`reference-tree-chevron ${isOpen ? "open" : ""}`}>{hasChildren ? ">" : ""}</span>
          </button>
          <button
            className={`reference-tree-entry-link ${entry.kind === "Field" ? "reference-tree-field-link" : ""}`}
            type="button"
            title={`${displayKind(entry)}: ${entry.name}`}
            onClick={() => navigateToEntry(entry.id)}
          >
            <strong>{entry.name}</strong>
          </button>
        </div>
        {hasChildren && isOpen && (
          <div className="reference-tree-children">
            {renderTreeNodes(node.children, level + 1)}
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="page-stack">
      <section className="page-intro reference-intro">
        <div>
          <p className="eyebrow">Reference</p>
          <h1>ACMM lookup.</h1>
        </div>
        <p>
          Browse project-wide concepts and JSON Schema definitions alongside experiment packages and analyzed data artifacts.
          The tree preserves the source hierarchy, while search can still locate any schema or package field directly.
        </p>
      </section>

      <section className="reference-summary-grid" aria-label="Reference catalog summary">
        <div><span>Entries</span><strong>{counts.all}</strong></div>
        <div><span>JSON Schemas</span><strong>{counts.schemas}</strong></div>
        <div><span>Packages</span><strong>{counts.packages}</strong></div>
        <div><span>Package YAML</span><strong>{counts.yaml}</strong></div>
        <div><span>Artifacts</span><strong>{counts.artifacts}</strong></div>
        <div><span>Fields</span><strong>{counts.fields}</strong></div>
        <div><span>Commands</span><strong>{counts.commands}</strong></div>
        <div><span>Concepts</span><strong>{counts.concepts}</strong></div>
      </section>

      <section className="reference-catalog-provenance" aria-label="Generated reference catalog status">
        <div>
          <span className="eyebrow">Source-generated reference catalog</span>
          <strong>
            {schemaCatalogInfo.schemaCount} schemas / {schemaCatalogInfo.fieldCount} schema fields / {schemaCatalogInfo.packageCount} packages / {schemaCatalogInfo.packageDocumentCount} package YAML files
          </strong>
          <small>{schemaCatalogInfo.generatedAt ? `Generated ${new Date(schemaCatalogInfo.generatedAt).toLocaleString()}` : "No source catalog generated in this checkout yet."}</small>
        </div>
        <div className="reference-source-chips">
          {schemaCatalogInfo.sources.length > 0 ? schemaCatalogInfo.sources.map((source) => (
            <span key={source.id}>
              <strong>{source.label}</strong>
              <code>{source.commit ? source.commit.slice(0, 12) : "commit unavailable"}</code>
              <small>
                {source.schemaCount} schemas / {source.fieldCount} schema fields / {source.packageCount ?? 0} packages / {source.packageDocumentCount ?? 0} YAML
              </small>
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
              ref={searchInputRef}
              id="reference-search"
              className="reference-search"
              type="search"
              value={query}
              placeholder="schema field, package file, command..."
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            />
            <details className="reference-advanced-search">
              <summary>Advanced search</summary>
              <div className="reference-advanced-search-body">
                <label className="reference-search-check">
                  <input
                    type="checkbox"
                    checked={namesAndPathsOnly}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setNamesAndPathsOnly(event.target.checked)}
                  />
                  <span>Match names and paths only</span>
                </label>

                <label className="reference-search-field">
                  <span>Exclude source files</span>
                  <input
                    type="text"
                    value={excludedFilesText}
                    placeholder="experiment-package.yaml, provider_gate"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setExcludedFilesText(event.target.value)}
                  />
                  <small>Comma-separated path substrings.</small>
                </label>

                <fieldset className="reference-search-roots">
                  <legend>Exclude hierarchy</legend>
                  {referenceRoots.map((root) => (
                    <label key={root}>
                      <input
                        type="checkbox"
                        checked={excludedRoots.has(root)}
                        onChange={() => toggleExcludedRoot(root)}
                      />
                      <span>{root}</span>
                    </label>
                  ))}
                </fieldset>

                <button className="reference-search-reset" type="button" onClick={clearAdvancedSearch}>
                  Clear advanced filters
                </button>
              </div>
            </details>
          </div>

          <div className="reference-tree-toolbar">
            <span>{filterActive ? `${queryResult.matchCount} matching entries` : `${counts.all} entries`}</span>
            <div>
              <button type="button" onClick={() => setExpanded(new Set(expandableNodeIds(tree)))}>Expand all</button>
              <button type="button" onClick={() => setExpanded(new Set())}>Collapse all</button>
            </div>
          </div>

          <nav className="reference-tree" aria-label="Reference hierarchy">
            {tree.length > 0 ? renderTreeNodes(tree) : (
              <div className="empty-state">
                <strong>No matching entries.</strong>
                <span>Try a schema field, package filename, command, concept, or alias.</span>
              </div>
            )}
          </nav>
        </div>

        {selectedEntry && (
          <article className="reference-detail" aria-live="polite">
            <div className="reference-detail-nav" aria-label="Reference history">
              <div>
                <button
                  type="button"
                  title="Return to the previously visited Reference entry. This follows visit history, not the tree hierarchy."
                  disabled={historyIndex <= 0}
                  onClick={() => window.history.back()}
                >
                  Back
                </button>
                <button
                  type="button"
                  title="Move forward through previously visited Reference entries."
                  disabled={historyIndex >= historyMax}
                  onClick={() => window.history.forward()}
                >
                  Forward
                </button>
              </div>
              <button type="button" onClick={() => void copyCurrentLink()}>
                {copied === "reference-link" ? "Link copied" : "Copy link"}
              </button>
            </div>

            <div className="reference-detail-scroll">
            <div className="reference-detail-heading">
              <div>
                <div className="reference-detail-badges">
                  <span className={`kind-badge kind-${kindClass(selectedEntry)}`}>{displayKind(selectedEntry)}</span>
                  <span className={`source-badge source-${sourceTone(selectedEntry)}`}>{selectedEntry.sourceLabel}</span>
                </div>
                <h2>{selectedEntry.name}</h2>
                <p>{selectedEntry.summary}</p>
              </div>
              {selectedEntry.kind === "Field" && (
                <button
                  className="reference-related-search-button"
                  type="button"
                  title="Search the Reference tree for entries with the same field name or path token."
                  onClick={() => searchRelatedField(selectedEntry)}
                >
                  Search related field
                </button>
              )}
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
                  <h3>{selectedEntry.kind === "Schema" ? "Schema fields" : selectedEntry.kind === "Yaml" ? "Package fields" : "Observed fields"}</h3>
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
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
