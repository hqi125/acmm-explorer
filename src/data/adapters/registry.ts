import type { InspectionResult } from "../types";
import type { AcmmExportDataset } from "../model";
import { acmmExportAdapter } from "./acmmExport";
import type { AdapterMatch, PackageAdapter } from "./types";

const adapters: PackageAdapter<unknown>[] = [acmmExportAdapter];

export function detectAdapters(inspection: InspectionResult): AdapterMatch[]
{
  return adapters
    .map((adapter) => adapter.detect(inspection))
    .filter((match): match is AdapterMatch => match !== null);
}

export async function normalizeWithAdapter(
  inspection: InspectionResult,
  adapterId: string,
): Promise<AcmmExportDataset>
{
  if (adapterId !== acmmExportAdapter.id)
  {
    throw new Error(`Unsupported adapter: ${adapterId}`);
  }

  return acmmExportAdapter.normalize(inspection);
}
