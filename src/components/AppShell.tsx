import type { ReactNode } from "react";
import { navigationItems, type AppView } from "../app/navigation";

interface AppShellProps
{
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  children: ReactNode;
}

export function AppShell({ activeView, onNavigate, children }: AppShellProps)
{
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

        <div className="local-badge" title="Selected experiment data is intended to stay in this browser session.">
          <span className="status-dot" aria-hidden="true" />
          Local only
        </div>
      </header>

      <main className="page-frame">{children}</main>

      <footer className="footer">
        <span>Agent Compliance Metric Model</span>
        <span>Local explorer</span>
      </footer>
    </div>
  );
}
