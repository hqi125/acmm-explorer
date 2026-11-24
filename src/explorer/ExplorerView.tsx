import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type WheelEvent,
} from "react";
import { detectAdapters, normalizeWithAdapter } from "../data/adapters/registry";
import {
  clearCachedExport,
  readCachedExport,
  updateCachedSelection,
  writeCachedExport,
  type CachedExportInfo,
} from "../data/cache/exportCache";
import { type AcmmExportDataset, type AnalysisSnapshot, type AgentProfile, type ComplianceDimension } from "../data/model";
import { createPreview } from "../data/ingest/preview";
import { inspectFiles } from "../data/ingest/inspect";
import type {
  DataFileKind,
  DataPreview,
  InspectionEntry,
  InspectionResult,
} from "../data/types";
import { ComplianceRadar } from "../visualization/ComplianceRadar";
import { ComplianceComparison } from "../visualization/ComplianceComparison";
import { ComplianceMultiRadar } from "../visualization/ComplianceMultiRadar";
import { AvailabilityDetailView, RequirementDetailView, TrajectoryDetailView } from "./AnalysisDetailViews";

const inventoryPageSize = 20;

const dimensionLabels: Record<ComplianceDimension, string> = {
  goal: "Goal",
  obligation: "Obligation",
  boundary: "Boundary",
  procedure: "Procedure",
  fidelity: "Fidelity",
  recovery: "Recovery",
};

function formatBytes(bytes: number): string
{
  if (bytes < 1024)
  {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024)
  {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatScore(value: number | null, digits = 3): string
{
  return value === null ? "-" : value.toFixed(digits);
}

function formatPercent(value: number | null): string
{
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function formatInteger(value: number | null): string
{
  return value === null ? "-" : Math.round(value).toLocaleString();
}

function kindLabel(kind: DataFileKind): string
{
  switch (kind)
  {
    case "xlsx":
      return "XLSX";
    case "csv":
      return "CSV";
    case "json":
      return "JSON";
    case "zip":
      return "ZIP";
    case "text":
      return "Text";
    default:
      return "Other";
  }
}

function basename(path: string): string
{
  return path.split("/").pop() ?? path;
}

function normalizeArchivePath(path: string): string
{
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
}

function formatTimestamp(value: string | null): string
{
  if (value === null)
  {
    return "Timestamp unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
  {
    return value;
  }

  return date.toLocaleString();
}

interface PreviewPanelProps
{
  entry: InspectionEntry | null;
  preview: DataPreview | null;
  loading: boolean;
}

function PreviewPanel({ entry, preview, loading }: PreviewPanelProps)
{
  if (entry === null)
  {
    return (
      <div className="preview-empty">
        <strong>Select a file from the inventory.</strong>
        <span>Previewable CSV, JSON, XLSX, and text files can be inspected without ACMM normalization.</span>
      </div>
    );
  }

  if (loading)
  {
    return (
      <div className="preview-empty">
        <strong>Reading preview...</strong>
        <span>{entry.path}</span>
      </div>
    );
  }

  if (preview === null)
  {
    return null;
  }

  if (preview.kind === "unavailable")
  {
    return (
      <div className="preview-empty">
        <strong>Preview unavailable.</strong>
        <span>{preview.reason}</span>
      </div>
    );
  }

  if (preview.kind === "table")
  {
    return (
      <div className="data-preview">
        <div className="preview-meta-row">
          <span>{preview.rowCount} data rows</span>
          <span>{preview.columnCount} columns</span>
          {preview.note !== undefined && <span>{preview.note}</span>}
        </div>
        <div className="table-scroll">
          <table className="preview-table">
            <thead>
              <tr>
                <th className="row-number">#</th>
                {preview.columns.map((column, index) => (
                  <th key={`${column}-${index}`}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  <th className="row-number">{rowIndex + 1}</th>
                  {preview.columns.map((_, columnIndex) => (
                    <td key={`cell-${rowIndex}-${columnIndex}`}>{row[columnIndex] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (preview.kind === "json")
  {
    return (
      <div className="data-preview">
        <div className="preview-meta-row">
          <span>{preview.valueType}</span>
          <span>{preview.summary}</span>
        </div>
        <pre className="code-preview">{preview.formatted}</pre>
      </div>
    );
  }

  return (
    <div className="data-preview">
      <div className="preview-meta-row">
        <span>Text preview</span>
        {preview.truncated && <span>Truncated</span>}
      </div>
      <pre className="code-preview">{preview.text}</pre>
    </div>
  );
}

interface AnalysisChooserProps
{
  dataset: AcmmExportDataset;
  selectedId: string;
  onSelect: (analysisId: string) => void;
  onConfirm: () => void;
}

function AnalysisChooser({ dataset, selectedId, onSelect, onConfirm }: AnalysisChooserProps)
{
  const selected = dataset.analyses.find((analysis) => analysis.id === selectedId) ?? null;

  useEffect(() =>
  {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () =>
    {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onWheel={(event: WheelEvent<HTMLDivElement>) => event.stopPropagation()}>
      <section className="analysis-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-modal-title">
        <div className="analysis-modal-heading">
          <div>
            <p className="eyebrow">Analysis selection</p>
            <h2 id="analysis-modal-title">Choose an analysis snapshot</h2>
            <p>{dataset.analyses.length} analyzed snapshots are available in this export.</p>
          </div>
          <span className="tag tag-muted">{dataset.experimentId}</span>
        </div>

        <div className="analysis-choice-list">
          {dataset.analyses.map((analysis, index) =>
          {
            const active = analysis.id === selectedId;
            const isDefault = analysis.id === dataset.defaultAnalysisId;
            return (
              <button
                className={active ? "analysis-choice analysis-choice-active" : "analysis-choice"}
                key={analysis.id}
                type="button"
                onClick={() => onSelect(analysis.id)}
              >
                <span className="analysis-choice-radio" aria-hidden="true" />
                <span className="analysis-choice-main">
                  <span className="analysis-choice-title">
                    <strong>{analysis.label}</strong>
                    {isDefault && <span className="tag tag-ready">Newest completed</span>}
                  </span>
                  <span className="analysis-choice-meta">
                    <span>ID {analysis.id}</span>
                    <span>Created {formatTimestamp(analysis.createdAt)}</span>
                    <span>Status {analysis.status}</span>
                  </span>
                  <span className="analysis-choice-meta">
                    <span>Manifest schema {analysis.manifestSchemaVersion ?? "legacy"}</span>
                    <span>Plan schema {analysis.planSchemaVersion ?? "legacy"}</span>
                    <span>{analysis.subjects.length} subjects</span>
                    <span>{analysis.availableTables.length} tables</span>
                  </span>
                  <span className="analysis-choice-config">
                    Profile: {analysis.profileEstimand} / {analysis.profileAggregationMethod} / {analysis.profileWeighting}
                  </span>
                </span>
                <span className="analysis-choice-order">{index + 1}</span>
              </button>
            );
          })}
        </div>

        <div className="analysis-modal-footer">
          <span>{selected === null ? "Select a snapshot to continue." : `Selected: ${selected.label}`}</span>
          <button className="button button-primary" type="button" disabled={selected === null} onClick={onConfirm}>
            Open analysis
          </button>
        </div>
      </section>
    </div>
  );
}

interface CopyValueProps
{
  value: string | null;
  compact?: boolean;
}

function CopyValue({ value, compact = false }: CopyValueProps)
{
  const [copied, setCopied] = useState(false);

  if (value === null)
  {
    return <span className="metadata-value">-</span>;
  }

  const copy = async () =>
  {
    try
    {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
    catch
    {
      setCopied(false);
    }
  };

  return (
    <span className="copy-value" title={value}>
      <span className={compact ? "copy-value-text copy-value-text-compact" : "copy-value-text"}>{value}</span>
      <button className="copy-button" type="button" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>
    </span>
  );
}

interface NormalizedProfileProps
{
  dataset: AcmmExportDataset;
  analysis: AnalysisSnapshot;
  profile: AgentProfile;
  selectedAnalysisId: string;
  selectedSubjectId: string;
  onAnalysisChange: (analysisId: string) => void;
  onSubjectChange: (subjectId: string) => void;
  onOpenSource: (path: string) => void;
}

function NormalizedProfile({
  dataset,
  analysis,
  profile,
  selectedAnalysisId,
  selectedSubjectId,
  onAnalysisChange,
  onSubjectChange,
  onOpenSource,
}: NormalizedProfileProps)
{
  const [comparisonMode, setComparisonMode] = useState<"radar" | "bars">("radar");
  const [detailView, setDetailView] = useState<"profile" | "requirements" | "availability" | "trajectory">("profile");
  const radarValues = useMemo(() =>
  {
    const values: Partial<Record<ComplianceDimension, number | null>> = {};
    for (const dimension of profile.dimensions)
    {
      values[dimension.dimension] = dimension.score;
    }
    return values;
  }, [profile]);

  const sourceId = dataset.sourceKind === "campaign"
    ? dataset.campaignId
    : dataset.executionId;

  return (
    <section className="normalized-card">
      <div className="normalized-heading">
        <div>
          <p className="eyebrow">Normalized ACMM export</p>
          <h2>{dataset.experimentId}</h2>
          <p>{dataset.sourceKind === "campaign" ? "Campaign export" : "Run export"} with analyzed output.</p>
        </div>
        <div className="normalized-heading-controls">
          <span className="tag tag-ready">Adapter: {dataset.adapterId}</span>
          <label className="analysis-switcher">
            <span>Analysis</span>
            <select value={selectedAnalysisId} onChange={(event: ChangeEvent<HTMLSelectElement>) => onAnalysisChange(event.target.value)}>
              {dataset.analyses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.planSchemaVersion === null ? item.label : `Plan ${item.planSchemaVersion} / ${item.id}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="metadata-groups">
        <section className="metadata-group">
          <p className="metadata-group-title">Export</p>
          <dl className="metadata-list">
            <div><dt>Schema</dt><dd>{dataset.exportSchemaVersion}</dd></div>
            <div><dt>Source kind</dt><dd>{dataset.sourceKind}</dd></div>
            <div><dt>Analyses</dt><dd>{dataset.analyses.length}</dd></div>
            <div className="metadata-wide"><dt>Source ID</dt><dd><CopyValue value={sourceId} compact /></dd></div>
          </dl>
        </section>

        <section className="metadata-group metadata-group-analysis">
          <p className="metadata-group-title">Selected analysis</p>
          <dl className="metadata-list">
            <div><dt>Status</dt><dd>{analysis.status}</dd></div>
            <div><dt>Created</dt><dd>{formatTimestamp(analysis.createdAt)}</dd></div>
            <div><dt>Manifest schema</dt><dd>{analysis.manifestSchemaVersion ?? "legacy"}</dd></div>
            <div><dt>Plan schema</dt><dd>{analysis.planSchemaVersion ?? "legacy"}</dd></div>
            <div className="metadata-wide"><dt>Profile</dt><dd>{analysis.profileEstimand} / {analysis.profileAggregationMethod} / {analysis.profileWeighting}</dd></div>
          </dl>
        </section>

        <section className="metadata-group">
          <p className="metadata-group-title">Provenance</p>
          <dl className="metadata-list metadata-list-provenance">
            <div className="metadata-wide"><dt>Package SHA</dt><dd><CopyValue value={dataset.packageSha256} compact /></dd></div>
            <div className="metadata-wide"><dt>Contract SHA</dt><dd><CopyValue value={dataset.contractSha256} compact /></dd></div>
            {analysis.fingerprintSha256 !== null && (
              <div className="metadata-wide"><dt>Analysis fingerprint</dt><dd><CopyValue value={analysis.fingerprintSha256} compact /></dd></div>
            )}
          </dl>
        </section>
      </div>

      {dataset.warnings.map((warning) => (
        <div className="warning-box normalized-warning" key={warning}>{warning}</div>
      ))}

      <div className="subject-selector">
        <span className="control-label">Subject</span>
        <div className="subject-tabs" aria-label="Agent subject">
          {analysis.subjects.map((subjectId) => (
            <button
              className={subjectId === selectedSubjectId ? "subject-tab subject-tab-active" : "subject-tab"}
              key={subjectId}
              type="button"
              onClick={() => onSubjectChange(subjectId)}
            >
              {subjectId}
            </button>
          ))}
        </div>
      </div>

      <div className="analysis-view-tabs" role="tablist" aria-label="Analysis view">
        <button className={detailView === "profile" ? "analysis-view-tab analysis-view-tab-active" : "analysis-view-tab"} type="button" onClick={() => setDetailView("profile")}>Profile</button>
        <button className={detailView === "requirements" ? "analysis-view-tab analysis-view-tab-active" : "analysis-view-tab"} type="button" onClick={() => setDetailView("requirements")}>Requirements</button>
        <button className={detailView === "availability" ? "analysis-view-tab analysis-view-tab-active" : "analysis-view-tab"} type="button" onClick={() => setDetailView("availability")}>Availability</button>
        <button className={detailView === "trajectory" ? "analysis-view-tab analysis-view-tab-active" : "analysis-view-tab"} type="button" onClick={() => setDetailView("trajectory")}>Trajectory</button>
      </div>

      {detailView === "profile" && (
        <>
          <div className="profile-workspace">
            <div className="profile-visual">
              <div className="profile-section-heading">
                <div>
                  <p className="eyebrow">Compliance profile</p>
                  <h3>{profile.subjectId}</h3>
                </div>
                <span className="tag tag-muted">Canonical analysis output</span>
              </div>
              <ComplianceRadar name={profile.subjectId} values={radarValues} ariaLabel={`ACMM compliance profile for ${profile.subjectId}`} />
            </div>

            <div className="profile-evidence">
              <div className="evidence-summary-grid">
                <div><span>Availability</span><strong>{formatPercent(profile.availability)}</strong></div>
                <div><span>Selected runs</span><strong>{formatInteger(profile.selectedRuns)}</strong></div>
                <div><span>Tool calls</span><strong>{formatInteger(profile.totalToolCalls)}</strong></div>
                <div><span>Mean calls/run</span><strong>{formatScore(profile.meanToolCallsPerRun, 2)}</strong></div>
                <div><span>Tool error rate</span><strong>{formatPercent(profile.toolErrorRate)}</strong></div>
              </div>

              <div className="dimension-table-wrap">
                <table className="dimension-table">
                  <thead>
                    <tr>
                      <th>Dimension</th>
                      <th>Score</th>
                      <th>Interval</th>
                      <th>Requirements</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.dimensions.map((dimension) => (
                      <tr key={dimension.dimension}>
                        <th>{dimensionLabels[dimension.dimension]}</th>
                        <td><strong>{formatScore(dimension.score)}</strong></td>
                        <td>{dimension.lower === null || dimension.upper === null ? "-" : `${formatScore(dimension.lower)} - ${formatScore(dimension.upper)}`}</td>
                        <td>{formatInteger(dimension.estimableRequirements)} / {formatInteger(dimension.totalRequirements)}</td>
                        <td>
                          <button className="source-link" type="button" onClick={() => onOpenSource(dimension.sourcePath)}>
                            dimension_scores.csv
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="comparison-section">
            <div className="profile-section-heading comparison-heading">
              <div>
                <p className="eyebrow">Agent comparison</p>
                <h3>Compliance dimensions across subjects</h3>
              </div>
              <div className="comparison-controls" role="group" aria-label="Agent comparison visualization">
                <button
                  className={comparisonMode === "radar" ? "view-toggle view-toggle-active" : "view-toggle"}
                  type="button"
                  onClick={() => setComparisonMode("radar")}
                >
                  Merged radar
                </button>
                <button
                  className={comparisonMode === "bars" ? "view-toggle view-toggle-active" : "view-toggle"}
                  type="button"
                  onClick={() => setComparisonMode("bars")}
                >
                  Bars
                </button>
              </div>
            </div>
            {comparisonMode === "radar"
              ? <ComplianceMultiRadar profiles={analysis.profiles} />
              : <ComplianceComparison profiles={analysis.profiles} />}
          </div>
        </>
      )}

      {detailView === "requirements" && <RequirementDetailView analysis={analysis} profile={profile} onOpenSource={onOpenSource} />}
      {detailView === "availability" && <AvailabilityDetailView analysis={analysis} profile={profile} onOpenSource={onOpenSource} />}
      {detailView === "trajectory" && <TrajectoryDetailView analysis={analysis} profile={profile} onOpenSource={onOpenSource} />}

      <div className="analysis-table-note">
        <span>{analysis.availableTables.length} analysis data tables available.</span>
        <span>Frontend plots use exported numeric tables; generated R plot images are not used.</span>
      </div>
    </section>
  );
}

interface InspectionOptions
{
  cacheAccepted?: boolean;
  preferredAnalysisId?: string | null;
  preferredSubjectId?: string | null;
}

export function ExplorerView()
{
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [normalizationError, setNormalizationError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<AcmmExportDataset | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState("");
  const [pendingAnalysisId, setPendingAnalysisId] = useState("");
  const [analysisChooserOpen, setAnalysisChooserOpen] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DataPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<DataFileKind | "all">("all");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [cacheInfo, setCacheInfo] = useState<CachedExportInfo | null>(null);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [restoringCache, setRestoringCache] = useState(false);
  const cacheRestoreStarted = useRef(false);

  const adapters = useMemo(
    () => inspection === null ? [] : detectAdapters(inspection),
    [inspection],
  );

  const activeAnalysis = useMemo(
    () => dataset?.analyses.find((analysis) => analysis.id === selectedAnalysisId) ?? null,
    [dataset, selectedAnalysisId],
  );

  const activeProfile = useMemo(
    () => activeAnalysis?.profiles.find((profile) => profile.subjectId === selectedSubjectId) ?? null,
    [activeAnalysis, selectedSubjectId],
  );

  const selectedEntry = useMemo(
    () => inspection?.entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [inspection, selectedEntryId],
  );

  const filteredEntries = useMemo(() =>
  {
    if (inspection === null)
    {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    return inspection.entries.filter((entry) =>
    {
      if (kindFilter !== "all" && entry.kind !== kindFilter)
      {
        return false;
      }

      if (normalizedQuery.length > 0 && !basename(entry.path).toLowerCase().includes(normalizedQuery))
      {
        return false;
      }

      return true;
    });
  }, [inspection, kindFilter, query]);


  const inventoryPageCount = Math.max(1, Math.ceil(filteredEntries.length / inventoryPageSize));
  const pagedEntries = useMemo(() =>
  {
    const start = (inventoryPage - 1) * inventoryPageSize;
    return filteredEntries.slice(start, start + inventoryPageSize);
  }, [filteredEntries, inventoryPage]);


  useEffect(() =>
  {
    if (inventoryPage > inventoryPageCount)
    {
      setInventoryPage(inventoryPageCount);
    }
  }, [inventoryPage, inventoryPageCount]);
  const kindCounts = useMemo(() =>
  {
    const counts = new Map<DataFileKind, number>();
    for (const entry of inspection?.entries ?? [])
    {
      counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    }
    return counts;
  }, [inspection]);

  const clearSelection = () =>
  {
    setSelectedFiles([]);
    setInspection(null);
    setInspectionError(null);
    setNormalizationError(null);
    setDataset(null);
    setSelectedAnalysisId("");
    setPendingAnalysisId("");
    setAnalysisChooserOpen(false);
    setSelectedSubjectId("");
    setSelectedEntryId(null);
    setPreview(null);
    setQuery("");
    setKindFilter("all");
    setInventoryPage(1);
    if (inputRef.current !== null)
    {
      inputRef.current.value = "";
    }
  };

  const persistSelection = (analysisId: string | null, subjectId: string | null) =>
  {
    void updateCachedSelection(analysisId, subjectId)
      .then((info) =>
      {
        if (info !== null)
        {
          setCacheInfo(info);
        }
      })
      .catch(() => undefined);
  };

  const normalizeInspection = async (
    result: InspectionResult,
    preferredAnalysisId: string | null = null,
    preferredSubjectId: string | null = null,
  ) =>
  {
    const matches = detectAdapters(result);
    const exact = matches.find((match) => match.confidence === "exact");
    if (exact === undefined)
    {
      return;
    }

    setNormalizing(true);
    setNormalizationError(null);
    try
    {
      const nextDataset = await normalizeWithAdapter(result, exact.adapterId);
      setDataset(nextDataset);

      const preferredAnalysis = preferredAnalysisId === null
        ? undefined
        : nextDataset.analyses.find((analysis) => analysis.id === preferredAnalysisId);
      const defaultAnalysis = preferredAnalysis
        ?? nextDataset.analyses.find((analysis) => analysis.id === nextDataset.defaultAnalysisId)
        ?? nextDataset.analyses[0];

      if (nextDataset.analyses.length > 1 && preferredAnalysis === undefined)
      {
        setSelectedAnalysisId("");
        setSelectedSubjectId("");
        setPendingAnalysisId(defaultAnalysis?.id ?? "");
        setAnalysisChooserOpen(true);
      }
      else
      {
        const nextAnalysisId = defaultAnalysis?.id ?? "";
        const nextSubjectId = preferredSubjectId !== null && defaultAnalysis?.subjects.includes(preferredSubjectId)
          ? preferredSubjectId
          : defaultAnalysis?.subjects[0] ?? "";
        setSelectedAnalysisId(nextAnalysisId);
        setSelectedSubjectId(nextSubjectId);
        setPendingAnalysisId(nextAnalysisId);
        setAnalysisChooserOpen(false);
        persistSelection(nextAnalysisId || null, nextSubjectId || null);
      }
    }
    catch (error)
    {
      setNormalizationError(error instanceof Error ? error.message : "Unknown normalization error.");
    }
    finally
    {
      setNormalizing(false);
    }
  };

  const inspectSelection = async (files: File[], options: InspectionOptions = {}) =>
  {
    setSelectedFiles(files);
    setInspecting(true);
    setInspection(null);
    setInspectionError(null);
    setNormalizationError(null);
    setDataset(null);
    setSelectedAnalysisId("");
    setPendingAnalysisId("");
    setAnalysisChooserOpen(false);
    setSelectedSubjectId("");
    setSelectedEntryId(null);
    setPreview(null);

    try
    {
      const result = await inspectFiles(files);
      setInspection(result);

      const exact = detectAdapters(result).some((match) => match.confidence === "exact");
      if (options.cacheAccepted === true && exact && files.length === 1)
      {
        try
        {
          const info = await writeCachedExport(files[0]);
          setCacheInfo(info);
          setCacheError(null);
        }
        catch (error)
        {
          setCacheError(error instanceof Error ? error.message : "Unable to cache this export locally.");
        }
      }

      await normalizeInspection(
        result,
        options.preferredAnalysisId ?? null,
        options.preferredSubjectId ?? null,
      );

      const firstPreviewable = result.entries.find((entry) => entry.previewable);
      if (firstPreviewable !== undefined)
      {
        setSelectedEntryId(firstPreviewable.id);
        setPreviewLoading(true);
        const nextPreview = await createPreview(firstPreviewable);
        setPreview(nextPreview);
        setPreviewLoading(false);
      }
    }
    catch (error)
    {
      const message = error instanceof Error ? error.message : "Unknown ingestion error.";
      setInspectionError(message);
    }
    finally
    {
      setInspecting(false);
    }
  };

  const acceptFiles = (fileList: FileList | null) =>
  {
    if (fileList === null || fileList.length === 0)
    {
      return;
    }

    void inspectSelection(Array.from(fileList), { cacheAccepted: true });
  };

  const clearCache = async () =>
  {
    try
    {
      await clearCachedExport();
      setCacheInfo(null);
      setCacheError(null);
    }
    catch (error)
    {
      setCacheError(error instanceof Error ? error.message : "Unable to clear the local export cache.");
    }
  };

  const selectEntry = async (entry: InspectionEntry) =>
  {
    setSelectedEntryId(entry.id);
    setPreview(null);
    setPreviewLoading(true);
    const nextPreview = await createPreview(entry);
    setPreview(nextPreview);
    setPreviewLoading(false);
  };

  const openSourcePath = (path: string) =>
  {
    const normalizedPath = normalizeArchivePath(path);
    const entry = inspection?.entries.find((candidate) => normalizeArchivePath(candidate.path) === normalizedPath);
    if (entry === undefined)
    {
      return;
    }

    setQuery("");
    setKindFilter("all");
    const inventoryIndex = inspection?.entries.findIndex((candidate) => candidate.id === entry.id) ?? -1;
    setInventoryPage(inventoryIndex < 0 ? 1 : Math.floor(inventoryIndex / inventoryPageSize) + 1);
    void selectEntry(entry);
    window.setTimeout(() => document.querySelector(".preview-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const confirmAnalysisSelection = () =>
  {
    if (dataset === null)
    {
      return;
    }

    const nextAnalysis = dataset.analyses.find((analysis) => analysis.id === pendingAnalysisId);
    if (nextAnalysis === undefined)
    {
      return;
    }

    const nextSubjectId = nextAnalysis.subjects[0] ?? "";
    setSelectedAnalysisId(nextAnalysis.id);
    setSelectedSubjectId(nextSubjectId);
    setAnalysisChooserOpen(false);
    persistSelection(nextAnalysis.id, nextSubjectId || null);
  };

  const changeAnalysis = (analysisId: string) =>
  {
    setSelectedAnalysisId(analysisId);
    setPendingAnalysisId(analysisId);
    const nextAnalysis = dataset?.analyses.find((analysis) => analysis.id === analysisId);
    if (nextAnalysis === undefined)
    {
      return;
    }

    const nextSubjectId = nextAnalysis.subjects.includes(selectedSubjectId)
      ? selectedSubjectId
      : nextAnalysis.subjects[0] ?? "";
    setSelectedSubjectId(nextSubjectId);
    persistSelection(analysisId, nextSubjectId || null);
  };

  const changeSubject = (subjectId: string) =>
  {
    setSelectedSubjectId(subjectId);
    persistSelection(selectedAnalysisId || null, subjectId);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    acceptFiles(event.target.files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) =>
  {
    event.preventDefault();
    setDragActive(false);
    acceptFiles(event.dataTransfer.files);
  };

  useEffect(() =>
  {
    if (cacheRestoreStarted.current)
    {
      return;
    }

    cacheRestoreStarted.current = true;
    setRestoringCache(true);
    void readCachedExport()
      .then(async (cached) =>
      {
        if (cached === null)
        {
          return;
        }

        setCacheInfo({
          name: cached.name,
          size: cached.size,
          cachedAt: cached.cachedAt,
          selectedAnalysisId: cached.selectedAnalysisId,
          selectedSubjectId: cached.selectedSubjectId,
        });
        await inspectSelection([cached.file], {
          cacheAccepted: false,
          preferredAnalysisId: cached.selectedAnalysisId,
          preferredSubjectId: cached.selectedSubjectId,
        });
      })
      .catch((error) => setCacheError(error instanceof Error ? error.message : "Unable to restore the local export cache."))
      .finally(() => setRestoringCache(false));
  }, []);

  const hasInspection = inspection !== null;
  const exactAdapterMatched = adapters.some((adapter) => adapter.confidence === "exact");
  const normalized = dataset !== null && activeAnalysis !== null && activeProfile !== null;
  const failedStage = inspectionError !== null
    ? 2
    : normalizationError !== null
      ? 4
      : inspection !== null && !exactAdapterMatched
        ? 3
        : null;

  const stageFailureMessage = failedStage === 2
    ? inspectionError
    : failedStage === 3
      ? adapters[0]?.reason ?? "No supported ACMM export adapter matched this package."
      : failedStage === 4
        ? normalizationError
        : null;

  const stageClass = (stage: number, complete: boolean, active: boolean): string =>
  {
    if (failedStage !== null)
    {
      if (stage < failedStage)
      {
        return "step-complete";
      }
      if (stage === failedStage)
      {
        return "step-failed";
      }
      return "step-blocked";
    }

    if (complete)
    {
      return "step-complete";
    }
    return active ? "step-active" : "";
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Data Explorer</p>
          <h1>Inspect exported experiment analysis.</h1>
        </div>
        <p>
          Open an ACMM export ZIP. Supported exports are normalized from analysis_output only;
          raw execution data is outside this viewer's scope.
        </p>
      </section>

      {analysisChooserOpen && dataset !== null && (
        <AnalysisChooser
          dataset={dataset}
          selectedId={pendingAnalysisId}
          onSelect={setPendingAnalysisId}
          onConfirm={confirmAnalysisSelection}
        />
      )}

      <section className="workspace-grid">
        <div className="workspace-main">
          {!hasInspection && (
            <div
              className={dragActive ? "drop-zone drop-zone-active" : "drop-zone"}
              onDragEnter={() => setDragActive(true)}
              onDragLeave={() => setDragActive(false)}
              onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <p className="eyebrow">Local data</p>
              <h2>{restoringCache ? "Restoring cached export..." : inspecting ? "Inspecting files..." : "Select an ACMM export ZIP"}</h2>
              <p>Exported analysis package produced by acmm run or acmm campaign.</p>
              <button
                className="button button-primary"
                type="button"
                disabled={inspecting || restoringCache}
                onClick={() => inputRef.current?.click()}
              >
                Choose export
              </button>
              <input
                ref={inputRef}
                id={inputId}
                className="visually-hidden"
                type="file"
                accept=".zip"
                onChange={handleFileChange}
              />
              <small>One export is cached locally in this browser. Opening another valid export replaces it.</small>
            </div>
          )}

          {inspectionError !== null && (
            <div className="error-box">
              <strong>Inspection failed.</strong>
              <span>{inspectionError}</span>
              <button className="text-button" type="button" onClick={clearSelection}>Clear selection</button>
            </div>
          )}

          {inspection !== null && (
            <>
              <section className="inspection-summary">
                <div className="card-heading-row">
                  <div>
                    <p className="eyebrow">Inspection</p>
                    <h2>{inspection.sources.length === 1 ? inspection.sources[0] : `${inspection.sources.length} selected sources`}</h2>
                  </div>
                  <button className="text-button" type="button" onClick={clearSelection}>Open different data</button>
                </div>

                <div className="summary-metrics">
                  <div><span>Files</span><strong>{inspection.entries.length}</strong></div>
                  <div><span>Previewable</span><strong>{inspection.entries.filter((entry) => entry.previewable).length}</strong></div>
                  <div><span>Signals</span><strong>{inspection.signals.length}</strong></div>
                  <div><span>Adapters</span><strong>{adapters.length}</strong></div>
                </div>

                {inspection.warnings.map((warning) => (
                  <div className="warning-box" key={warning}>{warning}</div>
                ))}
              </section>

              {normalizing && (
                <div className="working-box">Normalizing supported ACMM analysis output...</div>
              )}

              {normalizationError !== null && (
                <div className="error-box">
                  <strong>ACMM normalization failed.</strong>
                  <span>{normalizationError}</span>
                </div>
              )}

              {normalized && (
                <NormalizedProfile
                  dataset={dataset}
                  analysis={activeAnalysis}
                  profile={activeProfile}
                  selectedAnalysisId={selectedAnalysisId}
                  selectedSubjectId={selectedSubjectId}
                  onAnalysisChange={changeAnalysis}
                  onSubjectChange={changeSubject}
                  onOpenSource={openSourcePath}
                />
              )}

              <section className="inventory-card">
                <div className="inventory-toolbar">
                  <div>
                    <p className="eyebrow">File inventory</p>
                    <h2>Export contents</h2>
                  </div>
                  <input
                    className="inventory-search"
                    type="search"
                    value={query}
                    placeholder="Search file names..."
                    aria-label="Search file names"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    {
                      setQuery(event.target.value);
                      setInventoryPage(1);
                    }}
                  />
                </div>

                <div className="kind-filters" aria-label="Filter by file type">
                  <button
                    className={kindFilter === "all" ? "filter-chip filter-chip-active" : "filter-chip"}
                    type="button"
                    onClick={() =>
                    {
                      setKindFilter("all");
                      setInventoryPage(1);
                    }}
                  >
                    All <span>{inspection.entries.length}</span>
                  </button>
                  {(["csv", "xlsx", "json", "text", "unknown"] as DataFileKind[]).map((kind) =>
                  {
                    const count = kindCounts.get(kind) ?? 0;
                    if (count === 0)
                    {
                      return null;
                    }

                    return (
                      <button
                        className={kindFilter === kind ? "filter-chip filter-chip-active" : "filter-chip"}
                        type="button"
                        key={kind}
                        onClick={() =>
                        {
                          setKindFilter(kind);
                          setInventoryPage(1);
                        }}
                      >
                        {kindLabel(kind)} <span>{count}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="inventory-list">
                  {pagedEntries.map((entry) => (
                    <button
                      className={selectedEntryId === entry.id ? "inventory-row inventory-row-active" : "inventory-row"}
                      type="button"
                      key={entry.id}
                      onClick={() => void selectEntry(entry)}
                    >
                      <span className={`file-kind file-kind-${entry.kind}`}>{kindLabel(entry.kind)}</span>
                      <span className="file-path">
                        <strong>{basename(entry.path)}</strong>
                        <small>{entry.path}</small>
                      </span>
                      <span className="file-source">{entry.sourceName}</span>
                      <span className="file-size">{formatBytes(entry.size)}</span>
                      <span className={entry.previewable ? "preview-status preview-status-ready" : "preview-status"}>
                        {entry.previewable ? "Preview" : "Inventory"}
                      </span>
                    </button>
                  ))}
                  {filteredEntries.length === 0 && (
                    <div className="preview-empty compact-empty">
                      <strong>No matching files.</strong>
                      <span>Change the file-name search or file-type filter.</span>
                    </div>
                  )}
                </div>

                {filteredEntries.length > 0 && (
                  <div className="inventory-pagination" aria-label="File inventory pagination">
                    <span>
                      {((inventoryPage - 1) * inventoryPageSize) + 1}-{Math.min(inventoryPage * inventoryPageSize, filteredEntries.length)} of {filteredEntries.length}
                    </span>
                    <div className="pagination-controls">
                      <button
                        className="pagination-button"
                        type="button"
                        disabled={inventoryPage <= 1}
                        onClick={() => setInventoryPage((page) => Math.max(1, page - 1))}
                      >
                        Previous
                      </button>
                      <span>Page {inventoryPage} of {inventoryPageCount}</span>
                      <button
                        className="pagination-button"
                        type="button"
                        disabled={inventoryPage >= inventoryPageCount}
                        onClick={() => setInventoryPage((page) => Math.min(inventoryPageCount, page + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="preview-card">
                <div className="preview-heading">
                  <div>
                    <p className="eyebrow">Raw preview</p>
                    <h2>{selectedEntry === null ? "Select a file" : selectedEntry.path}</h2>
                  </div>
                  {selectedEntry !== null && (
                    <div className="preview-heading-meta">
                      <span>{kindLabel(selectedEntry.kind)}</span>
                      <span>{formatBytes(selectedEntry.size)}</span>
                    </div>
                  )}
                </div>
                <PreviewPanel entry={selectedEntry} preview={preview} loading={previewLoading} />
              </section>
            </>
          )}
        </div>

        <aside className="workspace-aside">
          <p className="eyebrow">Ingestion stages</p>
          <ol className="step-list">
            <li className={stageClass(1, selectedFiles.length > 0, selectedFiles.length === 0)}>
              <span>1</span><div><strong>Select</strong><small>Receive local export ZIP.</small></div>
            </li>
            <li className={stageClass(2, inspection !== null, selectedFiles.length > 0 && inspection === null)}>
              <span>2</span><div><strong>Inspect</strong><small>Inventory package contents.</small></div>
            </li>
            <li className={stageClass(3, exactAdapterMatched, inspection !== null && !exactAdapterMatched)}>
              <span>3</span><div><strong>Detect</strong><small>Match an ACMM export adapter.</small></div>
            </li>
            <li className={stageClass(4, dataset !== null, normalizing || (exactAdapterMatched && dataset === null))}>
              <span>4</span><div><strong>Normalize</strong><small>Read analyzed export tables.</small></div>
            </li>
            <li className={stageClass(5, false, dataset !== null)}>
              <span>5</span><div><strong>Explore</strong><small>Render linked ACMM views.</small></div>
            </li>
          </ol>

          {failedStage !== null && stageFailureMessage !== null && (
            <div className="stage-failure-summary">
              <strong>Stage {failedStage} failed</strong>
              <span>{stageFailureMessage}</span>
            </div>
          )}

          <div className="aside-section">
            <p className="eyebrow">Local cache</p>
            {cacheInfo === null ? (
              <p className="aside-note">No export cached. Explorer keeps at most one accepted export.</p>
            ) : (
              <div className="cache-summary">
                <strong>{cacheInfo.name}</strong>
                <small>1 export / {formatBytes(cacheInfo.size)}</small>
                <small>Cached {formatTimestamp(cacheInfo.cachedAt)}</small>
                <button className="text-button cache-clear" type="button" onClick={() => void clearCache()}>Clear cached copy</button>
              </div>
            )}
            {cacheError !== null && <p className="cache-error">{cacheError}</p>}
          </div>

          {inspection !== null && (
            <div className="aside-section">
              <p className="eyebrow">Structure signals</p>
              {inspection.signals.length > 0 ? (
                <div className="signal-list">
                  {inspection.signals.map((signal) => (
                    <div className="signal-item" key={signal.label}>
                      <strong>{signal.label}</strong><small>{signal.detail}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="aside-note">No known ACMM path signals were observed.</p>
              )}
            </div>
          )}

        </aside>
      </section>
    </div>
  );
}
