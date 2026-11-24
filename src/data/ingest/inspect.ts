import { unzip } from "fflate";
import { detectFileKind, isPreviewableKind } from "./fileKind";
import type { InspectionEntry, InspectionResult, InspectionSignal } from "../types";

function makeEntryId(sourceName: string, path: string, index: number): string
{
  return `${index}:${sourceName}:${path}`;
}

function unzipBytes(bytes: Uint8Array): Promise<Record<string, Uint8Array>>
{
  return new Promise((resolve, reject) =>
  {
    unzip(bytes, (error, data) =>
    {
      if (error)
      {
        reject(error);
        return;
      }

      resolve(data);
    });
  });
}

function buildSignals(entries: InspectionEntry[]): InspectionSignal[]
{
  const normalizedPaths = entries.map((entry) => entry.path.toLowerCase());
  const signals: InspectionSignal[] = [];

  const addPathSignal = (needle: string, label: string, detail: string) =>
  {
    if (normalizedPaths.some((path) => path.includes(needle)))
    {
      signals.push({ label, detail });
    }
  };

  addPathSignal("export_manifest.yaml", "ACMM export", "An export manifest is present.");
  addPathSignal("/analysis_output/", "Analysis output", "Exported analysis artifacts are present.");
  addPathSignal("/campaign_", "Campaign source", "The package contains a campaign export path.");
  addPathSignal("/execution_", "Run source", "The package contains a run execution export path.");
  addPathSignal("/analysis_output/analysis_", "Analysis snapshots", "Versioned analysis snapshots are present.");
  addPathSignal("adjudication", "Adjudication", "At least one path references adjudication data.");
  addPathSignal("provider_pressure", "Provider pressure", "At least one path contains provider-pressure data.");

  return signals;
}

export async function inspectFiles(files: File[]): Promise<InspectionResult>
{
  const entries: InspectionEntry[] = [];
  const warnings: string[] = [];
  let entryIndex = 0;

  for (const file of files)
  {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectFileKind(file.name);

    if (kind !== "zip")
    {
      entries.push({
        id: makeEntryId(file.name, file.name, entryIndex),
        sourceName: file.name,
        path: file.name,
        kind,
        size: bytes.byteLength,
        bytes,
        previewable: isPreviewableKind(kind),
      });
      entryIndex += 1;
      continue;
    }

    try
    {
      const archiveEntries = await unzipBytes(bytes);
      const archivePaths = Object.keys(archiveEntries).sort((left, right) => left.localeCompare(right));

      for (const path of archivePaths)
      {
        if (path.endsWith("/"))
        {
          continue;
        }

        const entryBytes = archiveEntries[path];
        const entryKind = detectFileKind(path);

        entries.push({
          id: makeEntryId(file.name, path, entryIndex),
          sourceName: file.name,
          path,
          kind: entryKind,
          size: entryBytes.byteLength,
          bytes: entryBytes,
          previewable: isPreviewableKind(entryKind),
        });
        entryIndex += 1;
      }
    }
    catch (error)
    {
      const message = error instanceof Error ? error.message : "Unknown ZIP error.";
      warnings.push(`${file.name}: unable to inspect ZIP archive (${message})`);
    }
  }

  if (entries.length === 0 && warnings.length === 0)
  {
    warnings.push("No inspectable files were selected.");
  }

  return {
    sources: files.map((file) => file.name),
    entries,
    signals: buildSignals(entries),
    warnings,
  };
}
