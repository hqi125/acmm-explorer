import type { DataFileKind } from "../types";

const textExtensions = new Set([
  "md",
  "txt",
  "log",
  "yaml",
  "yml",
]);

export function getFileExtension(path: string): string
{
  const basename = path.split("/").pop() ?? path;
  const dotIndex = basename.lastIndexOf(".");

  if (dotIndex < 0 || dotIndex === basename.length - 1)
  {
    return "";
  }

  return basename.slice(dotIndex + 1).toLowerCase();
}

export function detectFileKind(path: string): DataFileKind
{
  const extension = getFileExtension(path);

  switch (extension)
  {
    case "zip":
      return "zip";
    case "csv":
    case "tsv":
      return "csv";
    case "xlsx":
      return "xlsx";
    case "json":
      return "json";
    default:
      if (textExtensions.has(extension))
      {
        return "text";
      }
      return "unknown";
  }
}

export function isPreviewableKind(kind: DataFileKind): boolean
{
  return kind === "csv" || kind === "xlsx" || kind === "json" || kind === "text";
}
