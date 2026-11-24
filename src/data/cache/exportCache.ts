const databaseName = "acmm-explorer";
const databaseVersion = 1;
const storeName = "export-cache";
const activeKey = "active";

interface CachedExportRecord
{
  key: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  cachedAt: string;
  blob: Blob;
  selectedAnalysisId: string | null;
  selectedSubjectId: string | null;
}

export interface CachedExportInfo
{
  name: string;
  size: number;
  cachedAt: string;
  selectedAnalysisId: string | null;
  selectedSubjectId: string | null;
}

export interface CachedExport extends CachedExportInfo
{
  file: File;
}

function openDatabase(): Promise<IDBDatabase>
{
  return new Promise((resolve, reject) =>
  {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () =>
    {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName))
      {
        database.createObjectStore(storeName, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the local export cache."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T>
{
  const database = await openDatabase();
  try
  {
    return await new Promise<T>((resolve, reject) =>
    {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Local export cache operation failed."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Local export cache transaction failed."));
    });
  }
  finally
  {
    database.close();
  }
}

function toInfo(record: CachedExportRecord): CachedExportInfo
{
  return {
    name: record.name,
    size: record.size,
    cachedAt: record.cachedAt,
    selectedAnalysisId: record.selectedAnalysisId,
    selectedSubjectId: record.selectedSubjectId,
  };
}

export async function readCachedExport(): Promise<CachedExport | null>
{
  const record = await withStore<CachedExportRecord | undefined>("readonly", (store) => store.get(activeKey));
  if (record === undefined)
  {
    return null;
  }

  return {
    ...toInfo(record),
    file: new File([record.blob], record.name, {
      type: record.type,
      lastModified: record.lastModified,
    }),
  };
}

export async function writeCachedExport(file: File): Promise<CachedExportInfo>
{
  const record: CachedExportRecord = {
    key: activeKey,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    cachedAt: new Date().toISOString(),
    blob: file,
    selectedAnalysisId: null,
    selectedSubjectId: null,
  };

  await withStore<IDBValidKey>("readwrite", (store) => store.put(record));
  return toInfo(record);
}

export async function updateCachedSelection(
  selectedAnalysisId: string | null,
  selectedSubjectId: string | null,
): Promise<CachedExportInfo | null>
{
  const database = await openDatabase();
  try
  {
    return await new Promise<CachedExportInfo | null>((resolve, reject) =>
    {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const getRequest = store.get(activeKey);

      getRequest.onerror = () => reject(getRequest.error ?? new Error("Unable to read the local export cache."));
      getRequest.onsuccess = () =>
      {
        const record = getRequest.result as CachedExportRecord | undefined;
        if (record === undefined)
        {
          resolve(null);
          return;
        }

        const nextRecord: CachedExportRecord = {
          ...record,
          selectedAnalysisId,
          selectedSubjectId,
        };
        const putRequest = store.put(nextRecord);
        putRequest.onerror = () => reject(putRequest.error ?? new Error("Unable to update the local export cache."));
        putRequest.onsuccess = () => resolve(toInfo(nextRecord));
      };

      transaction.onerror = () => reject(transaction.error ?? new Error("Local export cache transaction failed."));
    });
  }
  finally
  {
    database.close();
  }
}

export async function clearCachedExport(): Promise<void>
{
  await withStore<undefined>("readwrite", (store) => store.delete(activeKey));
}
