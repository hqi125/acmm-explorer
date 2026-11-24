const delimiterCandidates = [",", "\t", ";", "|"] as const;

function countDelimiterOutsideQuotes(line: string, delimiter: string): number
{
  let inQuotes = false;
  let count = 0;

  for (let index = 0; index < line.length; index += 1)
  {
    const char = line[index];

    if (char === '"')
    {
      if (inQuotes && line[index + 1] === '"')
      {
        index += 1;
      }
      else
      {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter)
    {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(text: string): string
{
  const firstUsefulLine = text
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) ?? "";

  let bestDelimiter = ",";
  let bestCount = -1;

  for (const candidate of delimiterCandidates)
  {
    const count = countDelimiterOutsideQuotes(firstUsefulLine, candidate);
    if (count > bestCount)
    {
      bestDelimiter = candidate;
      bestCount = count;
    }
  }

  return bestDelimiter;
}

export interface ParsedDelimitedText
{
  delimiter: string;
  rows: string[][];
}

export function parseDelimitedText(text: string): ParsedDelimitedText
{
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () =>
  {
    row.push(field);
    field = "";
  };

  const pushRow = () =>
  {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1)
  {
    const char = text[index];

    if (char === '"')
    {
      if (inQuotes && text[index + 1] === '"')
      {
        field += '"';
        index += 1;
      }
      else
      {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter)
    {
      pushField();
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r"))
    {
      if (char === "\r" && text[index + 1] === "\n")
      {
        index += 1;
      }
      pushRow();
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0)
  {
    pushRow();
  }

  while (rows.length > 0 && rows[rows.length - 1].every((value) => value.length === 0))
  {
    rows.pop();
  }

  return { delimiter, rows };
}
