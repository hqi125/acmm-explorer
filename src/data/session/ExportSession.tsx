import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { detectAdapters, normalizeWithAdapter } from "../adapters/registry";
import {
  clearCachedExport,
  readCachedExport,
  updateCachedSelection,
  writeCachedExport,
  type CachedExportInfo,
} from "../cache/exportCache";
import { inspectFiles } from "../ingest/inspect";
import type { AcmmExportDataset } from "../model";
import type { InspectionResult } from "../types";

export type ExportSessionPhase = "idle" | "restoring" | "inspecting" | "normalizing" | "ready";

interface LoadExportOptions
{
  cacheAccepted?: boolean;
  preferredAnalysisId?: string | null;
  preferredSubjectId?: string | null;
}

interface ExportSessionValue
{
  selectedFiles: File[];
  inspection: InspectionResult | null;
  inspectionError: string | null;
  normalizationError: string | null;
  dataset: AcmmExportDataset | null;
  selectedAnalysisId: string;
  pendingAnalysisId: string;
  analysisChooserOpen: boolean;
  selectedSubjectId: string;
  cacheInfo: CachedExportInfo | null;
  cacheError: string | null;
  phase: ExportSessionPhase;
  busy: boolean;
  busyLabel: string | null;
  loadExport: (files: File[], options?: LoadExportOptions) => Promise<InspectionResult | null>;
  clearSession: () => void;
  clearCache: () => Promise<void>;
  setPendingAnalysisId: (analysisId: string) => void;
  confirmAnalysisSelection: () => void;
  changeAnalysis: (analysisId: string) => void;
  changeSubject: (subjectId: string) => void;
}

const ExportSessionContext = createContext<ExportSessionValue | null>(null);

function busyLabelForPhase(phase: ExportSessionPhase): string | null
{
  if (phase === "restoring")
  {
    return "Restoring cached export";
  }
  if (phase === "inspecting")
  {
    return "Inspecting export package";
  }
  if (phase === "normalizing")
  {
    return "Normalizing analyzed output";
  }
  return null;
}

export function ExportSessionProvider({ children }: { children: ReactNode })
{
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [normalizationError, setNormalizationError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<AcmmExportDataset | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState("");
  const [pendingAnalysisId, setPendingAnalysisId] = useState("");
  const [analysisChooserOpen, setAnalysisChooserOpen] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [cacheInfo, setCacheInfo] = useState<CachedExportInfo | null>(null);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ExportSessionPhase>("idle");
  const operationId = useRef(0);
  const restoreStarted = useRef(false);

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

  const loadExport = async (
    files: File[],
    options: LoadExportOptions = {},
  ): Promise<InspectionResult | null> =>
  {
    const currentOperation = ++operationId.current;
    setSelectedFiles(files);
    setInspection(null);
    setInspectionError(null);
    setNormalizationError(null);
    setDataset(null);
    setSelectedAnalysisId("");
    setPendingAnalysisId("");
    setAnalysisChooserOpen(false);
    setSelectedSubjectId("");
    setPhase(options.cacheAccepted === false ? "restoring" : "inspecting");

    let result: InspectionResult;
    try
    {
      result = await inspectFiles(files);
    }
    catch (error)
    {
      if (operationId.current === currentOperation)
      {
        setInspectionError(error instanceof Error ? error.message : "Unknown ingestion error.");
        setPhase("idle");
      }
      return null;
    }

    if (operationId.current !== currentOperation)
    {
      return null;
    }

    setInspection(result);
    const matches = detectAdapters(result);
    const exact = matches.find((match) => match.confidence === "exact");

    if (options.cacheAccepted === true && exact !== undefined && files.length === 1)
    {
      try
      {
        const info = await writeCachedExport(files[0]);
        if (operationId.current === currentOperation)
        {
          setCacheInfo(info);
          setCacheError(null);
        }
      }
      catch (error)
      {
        if (operationId.current === currentOperation)
        {
          setCacheError(error instanceof Error ? error.message : "Unable to cache this export locally.");
        }
      }
    }

    if (exact === undefined)
    {
      setPhase("ready");
      return result;
    }

    setPhase("normalizing");
    try
    {
      const nextDataset = await normalizeWithAdapter(result, exact.adapterId);
      if (operationId.current !== currentOperation)
      {
        return null;
      }

      setDataset(nextDataset);
      const preferredAnalysis = options.preferredAnalysisId === null || options.preferredAnalysisId === undefined
        ? undefined
        : nextDataset.analyses.find((analysis) => analysis.id === options.preferredAnalysisId);
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
        const nextSubjectId = options.preferredSubjectId !== null
          && options.preferredSubjectId !== undefined
          && defaultAnalysis?.subjects.includes(options.preferredSubjectId)
          ? options.preferredSubjectId
          : defaultAnalysis?.subjects[0] ?? "";
        setSelectedAnalysisId(nextAnalysisId);
        setSelectedSubjectId(nextSubjectId);
        setPendingAnalysisId(nextAnalysisId);
        setAnalysisChooserOpen(false);
        persistSelection(nextAnalysisId || null, nextSubjectId || null);
      }
      setNormalizationError(null);
    }
    catch (error)
    {
      if (operationId.current === currentOperation)
      {
        setNormalizationError(error instanceof Error ? error.message : "Unknown normalization error.");
      }
    }
    finally
    {
      if (operationId.current === currentOperation)
      {
        setPhase("ready");
      }
    }

    return result;
  };

  const clearSession = () =>
  {
    operationId.current += 1;
    setSelectedFiles([]);
    setInspection(null);
    setInspectionError(null);
    setNormalizationError(null);
    setDataset(null);
    setSelectedAnalysisId("");
    setPendingAnalysisId("");
    setAnalysisChooserOpen(false);
    setSelectedSubjectId("");
    setPhase("idle");
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

  useEffect(() =>
  {
    if (restoreStarted.current)
    {
      return;
    }
    restoreStarted.current = true;
    setPhase("restoring");
    void readCachedExport()
      .then(async (cached) =>
      {
        if (cached === null)
        {
          setPhase("idle");
          return;
        }
        setCacheInfo({
          name: cached.name,
          size: cached.size,
          cachedAt: cached.cachedAt,
          selectedAnalysisId: cached.selectedAnalysisId,
          selectedSubjectId: cached.selectedSubjectId,
        });
        await loadExport([cached.file], {
          cacheAccepted: false,
          preferredAnalysisId: cached.selectedAnalysisId,
          preferredSubjectId: cached.selectedSubjectId,
        });
      })
      .catch((error) =>
      {
        setCacheError(error instanceof Error ? error.message : "Unable to restore the local export cache.");
        setPhase("idle");
      });
  }, []);

  const busy = phase === "restoring" || phase === "inspecting" || phase === "normalizing";
  const value = useMemo<ExportSessionValue>(() => ({
    selectedFiles,
    inspection,
    inspectionError,
    normalizationError,
    dataset,
    selectedAnalysisId,
    pendingAnalysisId,
    analysisChooserOpen,
    selectedSubjectId,
    cacheInfo,
    cacheError,
    phase,
    busy,
    busyLabel: busyLabelForPhase(phase),
    loadExport,
    clearSession,
    clearCache,
    setPendingAnalysisId,
    confirmAnalysisSelection,
    changeAnalysis,
    changeSubject,
  }), [
    selectedFiles,
    inspection,
    inspectionError,
    normalizationError,
    dataset,
    selectedAnalysisId,
    pendingAnalysisId,
    analysisChooserOpen,
    selectedSubjectId,
    cacheInfo,
    cacheError,
    phase,
    busy,
  ]);

  return (
    <ExportSessionContext.Provider value={value}>
      {children}
    </ExportSessionContext.Provider>
  );
}

export function useExportSession(): ExportSessionValue
{
  const value = useContext(ExportSessionContext);
  if (value === null)
  {
    throw new Error("useExportSession must be used inside ExportSessionProvider.");
  }
  return value;
}
