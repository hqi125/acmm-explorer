import type { InspectionResult } from "../types";

export interface AdapterMatch
{
  adapterId: string;
  confidence: "exact" | "probable" | "possible";
  reason: string;
}

export interface PackageAdapter<TDataset>
{
  id: string;
  label: string;
  detect: (inspection: InspectionResult) => AdapterMatch | null;
  normalize: (inspection: InspectionResult) => Promise<TDataset>;
}
