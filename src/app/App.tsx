import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { AboutView } from "../components/AboutView";
import { HomeView } from "../components/HomeView";
import { ExplorerView } from "../explorer/ExplorerView";
import { ReferenceView } from "../reference/ReferenceView";
import { WorkshopView } from "../workshop/WorkshopView";
import type { AppView } from "./navigation";

export function App()
{
  const [activeView, setActiveView] = useState<AppView>("home");

  return (
    <AppShell activeView={activeView} onNavigate={setActiveView}>
      {activeView === "home" && <HomeView onNavigate={setActiveView} />}
      {activeView === "explorer" && <ExplorerView />}
      {activeView === "workshop" && <WorkshopView onNavigate={setActiveView} />}
      {activeView === "reference" && <ReferenceView />}
      {activeView === "about" && <AboutView />}
    </AppShell>
  );
}
