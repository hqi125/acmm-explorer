export type AppView = "home" | "explorer" | "workshop" | "reference" | "about";

export interface NavigationItem
{
  id: AppView;
  label: string;
  eyebrow: string;
}

export const navigationItems: NavigationItem[] = [
  { id: "home", label: "Overview", eyebrow: "Start" },
  { id: "explorer", label: "Data Explorer", eyebrow: "Inspect" },
  { id: "workshop", label: "Decision Workshop", eyebrow: "Decide" },
  { id: "reference", label: "Reference", eyebrow: "Lookup" },
  { id: "about", label: "About", eyebrow: "Project" },
];
