import { readSheet } from "read-excel-file/universal";
import { parseDelimitedText } from "./csv";
import type { DataPreview, InspectionEntry, TablePreview } from "../types";

const previewRowLimit = 14;
const previewColumnLimit = 12;
const textCharacterLimit = 12000;

function formatCell(value: unknown): string
{
  if (value === null || value === undefined)
  {
    return "";
  }

  if (value instanceof Date)
  {
    return value.toISOString();
  }

  if (typeof value === "object")
  {
    try
    {
      return JSON.stringify(value);
    }
    catch
    {
      return String(value);
    }
  }

  return String(value);
}

function normalizeTable(rows: unknown[][], note?: string): TablePreview
{
  const normalizedRows = rows.map((row) => row.map(formatCell));
  const columnCount = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0);
  const firstRow = normalizedRows[0] ?? [];
  const canUseHeader = firstRow.length > 0
    && firstRow.every((cell) => cell.trim().length > 0)
    && new Set(firstRow).size === firstRow.length;

  const generatedColumns = Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  const columns = canUseHeader ? firstRow : generatedColumns;
  const dataRows = canUseHeader ? normalizedRows.slice(1) : normalizedRows;
  const limitedColumns = columns.slice(0, previewColumnLimit);
  const limitedRows = dataRows
    .slice(0, previewRowLimit)
    .map((row) => row.slice(0, previewColumnLimit));

  return {
    kind: "table",
    columns: limitedColumns,
    rows: limitedRows,
    rowCount: dataRows.length,
    columnCount,
    note: [
      canUseHeader ? "First row is used as preview column labels." : "Preview uses generated column labels.",
      note,
    ].filter((value): value is string => Boolean(value)).join(" "),
  };
}

function summarizeJson(value: unknown): { valueType: string; summary: string }
{
  if (Array.isArray(value))
  {
    return {
      valueType: "array",
      summary: `${value.length} top-level item${value.length === 1 ? "" : "s"}`,
    };
  }

  if (value !== null && typeof value === "object")
  {
    const keys = Object.keys(value as Record<string, unknown>);
    return {
      valueType: "object",
      summary: `${keys.length} top-level key${keys.length === 1 ? "" : "s"}`,
    };
  }

  return {
    valueType: value === null ? "null" : typeof value,
    summary: "Scalar JSON value",
  };
}

function jsonToTable(value: unknown): TablePreview | null
{
  if (!Array.isArray(value) || value.length === 0)
  {
    return null;
  }

  if (!value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item)))
  {
    return null;
  }

  const objects = value as Record<string, unknown>[];
  const columnSet = new Set<string>();

  for (const object of objects.slice(0, previewRowLimit))
  {
    for (const key of Object.keys(object))
    {
      columnSet.add(key);
      if (columnSet.size >= previewColumnLimit)
      {
        break;
      }
    }
  }

  const columns = Array.from(columnSet);
  const rows = objects
    .slice(0, previewRowLimit)
    .map((object) => columns.map((column) => formatCell(object[column])));

  return {
    kind: "table",
    columns,
    rows,
    rowCount: objects.length,
    columnCount: columns.length,
    note: "JSON array of objects rendered as a tabular preview.",
  };
}

export async function createPreview(entry: InspectionEntry): Promise<DataPreview>
{
  if (!entry.previewable)
  {
    return {
      kind: "unavailable",
      reason: "No preview parser is registered for this file type.",
    };
  }

  try
  {
    if (entry.kind === "csv")
    {
      const text = new TextDecoder().decode(entry.bytes);
      const parsed = parseDelimitedText(text);
      const delimiterName = parsed.delimiter === "\t" ? "tab" : parsed.delimiter;
      return normalizeTable(parsed.rows, `Detected delimiter: ${delimiterName}.`);
    }

    if (entry.kind === "xlsx")
    {
      const data = await readSheet(entry.bytes.buffer.slice(
        entry.bytes.byteOffset,
        entry.bytes.byteOffset + entry.bytes.byteLength,
      ));

      return normalizeTable(data as unknown[][], "Preview reads the first worksheet only.");
    }

    if (entry.kind === "json")
    {
      const text = new TextDecoder().decode(entry.bytes);
      const value: unknown = JSON.parse(text);
      const table = jsonToTable(value);
      if (table !== null)
      {
        return table;
      }

      const summary = summarizeJson(value);
      let formatted = JSON.stringify(value, null, 2);
      if (formatted.length > textCharacterLimit)
      {
        formatted = `${formatted.slice(0, textCharacterLimit)}\n... preview truncated ...`;
      }

      return {
        kind: "json",
        valueType: summary.valueType,
        summary: summary.summary,
        formatted,
      };
    }

    const text = new TextDecoder().decode(entry.bytes);
    return {
      kind: "text",
      text: text.slice(0, textCharacterLimit),
      truncated: text.length > textCharacterLimit,
    };
  }
  catch (error)
  {
    const message = error instanceof Error ? error.message : "Unknown preview error.";
    return {
      kind: "unavailable",
      reason: `Preview failed: ${message}`,
    };
  }
}
