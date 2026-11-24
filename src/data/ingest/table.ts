import { parseDelimitedText } from "./csv";
import type { InspectionEntry } from "../types";

export type DataRow = Record<string, string>;

const decoder = new TextDecoder("utf-8");

export function parseCsvEntry(entry: InspectionEntry): DataRow[]
{
  const text = decoder.decode(entry.bytes);
  const { rows } = parseDelimitedText(text);

  if (rows.length === 0)
  {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) =>
  {
    const output: DataRow = {};
    headers.forEach((header, index) =>
    {
      output[header] = row[index] ?? "";
    });
    return output;
  });
}

export function parseNullableNumber(value: string | undefined): number | null
{
  if (value === undefined || value.trim().length === 0)
  {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
