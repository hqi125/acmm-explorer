import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";

interface SelectedFile
{
  name: string;
  size: number;
  type: string;
}

function formatBytes(bytes: number): string
{
  if (bytes < 1024)
  {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024)
  {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

function toSelectedFiles(files: FileList | null): SelectedFile[]
{
  if (files === null)
  {
    return [];
  }

  return Array.from(files).map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type || "unknown",
  }));
}

export function ExplorerView()
{
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const acceptFiles = (fileList: FileList | null) =>
  {
    setFiles(toSelectedFiles(fileList));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    acceptFiles(event.target.files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) =>
  {
    event.preventDefault();
    setDragActive(false);
    acceptFiles(event.dataTransfer.files);
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Data Explorer</p>
          <h1>Open experiment data.</h1>
        </div>
        <p>
          Select local ACMM output files for inspection. The current scaffold records file metadata only;
          package detection, validation, and parsing will be added with the first data adapter.
        </p>
      </section>

      <section className="workspace-grid">
        <div className="workspace-main">
          <div
            className={dragActive ? "drop-zone drop-zone-active" : "drop-zone"}
            onDragEnter={() => setDragActive(true)}
            onDragLeave={() => setDragActive(false)}
            onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="drop-symbol" aria-hidden="true">+</div>
            <p className="eyebrow">Local files</p>
            <h2>Select ACMM output data</h2>
            <p>ZIP, CSV, XLSX, or JSON.</p>
            <button className="button button-primary" type="button" onClick={() => inputRef.current?.click()}>
              Choose files
            </button>
            <input
              ref={inputRef}
              id={inputId}
              className="visually-hidden"
              type="file"
              multiple
              accept=".zip,.csv,.xlsx,.json"
              onChange={handleFileChange}
            />
            <small>Files remain local to this browser session.</small>
          </div>

          {files.length > 0 && (
            <div className="selected-files">
              <div className="card-heading-row">
                <div>
                  <p className="eyebrow">Selection</p>
                  <h2>Selected files</h2>
                </div>
                <button className="text-button" type="button" onClick={() => setFiles([])}>Clear</button>
              </div>
              {files.map((file) => (
                <div className="file-row" key={`${file.name}-${file.size}`}>
                  <div>
                    <strong>{file.name}</strong>
                    <small>{file.type}</small>
                  </div>
                  <span>{formatBytes(file.size)}</span>
                </div>
              ))}
              <div className="notice-box">
                Parsing is not enabled yet. The first adapter will define supported ACMM package structure
                and validation rules before these files are interpreted.
              </div>
            </div>
          )}
        </div>

        <aside className="workspace-aside">
          <p className="eyebrow">Ingestion stages</p>
          <ol className="step-list">
            <li className="step-active">
              <span>1</span>
              <div><strong>Select</strong><small>Receive local files.</small></div>
            </li>
            <li>
              <span>2</span>
              <div><strong>Detect</strong><small>Identify package and version.</small></div>
            </li>
            <li>
              <span>3</span>
              <div><strong>Validate</strong><small>Check required artifacts.</small></div>
            </li>
            <li>
              <span>4</span>
              <div><strong>Normalize</strong><small>Create canonical records.</small></div>
            </li>
            <li>
              <span>5</span>
              <div><strong>Explore</strong><small>Render linked data views.</small></div>
            </li>
          </ol>
        </aside>
      </section>
    </div>
  );
}
