import type { ReactNode } from "react";
import { navigationItems, type AppView } from "../app/navigation";
import { useExportSession } from "../data/session/ExportSession";

interface AppShellProps
{
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  children: ReactNode;
}

export function AppShell({ activeView, onNavigate, children }: AppShellProps)
{
  const { busy, busyLabel, dataset } = useExportSession();

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => onNavigate("home")}>
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>
            <strong>ACMM Explorer</strong>
            <small>Experiment data and reference</small>
          </span>
        </button>

        <nav className="topnav" aria-label="Primary navigation">
          {navigationItems.map((item) => (
            <button
              className={activeView === item.id ? "nav-item nav-item-active" : "nav-item"}
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
            >
              <small>{item.eyebrow}</small>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div
          className={busy ? "local-badge local-badge-busy" : "local-badge"}
          title="Selected experiment data stays local to this browser; one accepted export may be cached locally."
        >
          <span className={busy ? "status-dot status-dot-busy" : "status-dot"} aria-hidden="true" />
          {busy ? busyLabel : dataset === null ? "Local only" : "Export loaded"}
        </div>
      </header>

      {busy && (
        <div className="global-loading" role="status" aria-live="polite">
          <span className="global-loading-bar" aria-hidden="true" />
          <span>{busyLabel}</span>
          <small>Navigation remains available; this shared load continues once for the application.</small>
        </div>
      )}

      <main className="page-frame">{children}</main>

      <footer className="footer">
        <span>Agent Compliance Metric Model</span>
        <span>Local explorer</span>
      </footer>
    </div>
  );
}
