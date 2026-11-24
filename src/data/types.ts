export type DataFileKind = "zip" | "csv" | "xlsx" | "json" | "text" | "unknown";

export type PreviewKind = "table" | "json" | "text" | "unavailable";

export interface TablePreview
{
  kind: "table";
  columns: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
  note?: string;
}

export interface JsonPreview
{
  kind: "json";
  valueType: string;
  summary: string;
  formatted: string;
}

export interface TextPreview
{
  kind: "text";
  text: string;
  truncated: boolean;
}

export interface UnavailablePreview
{
  kind: "unavailable";
  reason: string;
}

export type DataPreview = TablePreview | JsonPreview | TextPreview | UnavailablePreview;

export interface InspectionEntry
{
  id: string;
  sourceName: string;
  path: string;
  kind: DataFileKind;
  size: number;
  bytes: Uint8Array;
  previewable: boolean;
}

export interface InspectionSignal
{
  label: string;
  detail: string;
}

export interface InspectionResult
{
  sources: string[];
  entries: InspectionEntry[];
  signals: InspectionSignal[];
  warnings: string[];
}
