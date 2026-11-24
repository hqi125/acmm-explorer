# acmm-explorer

Local-only experiment-data explorer and usage reference for the Agent Compliance Metric Model (ACMM).

ACMM Explorer is intentionally separate from the frozen ACMM research and experiment repositories. It is a local, read-only working interface: experiment outputs are opened locally, normalized by version-aware adapters, inspected through tables and visualizations, and linked back to their source evidence. The reference area provides a searchable lookup surface for ACMM commands, schemas, and project concepts.

## Current status

The project now includes ACMM-aware export viewing plus a reusable Decision Workshop function store. The current build includes:

- React + TypeScript + Vite frontend foundation.
- Docker-contained development environment.
- Browser-local ZIP inspection and raw CSV/JSON/XLSX/text previews.
- ACMM export-manifest detection and normalization for analyzed export packages.
- Legacy `acmm run` export support for schema `0.1` with direct `analysis_output/data/...` layout.
- Current `acmm campaign` export support for schema `0.3` with versioned `analysis_output/analysis_<id>/...` snapshots.
- Explicit analysis-snapshot selection when an export contains multiple analyses, with a compact in-view switcher after loading.
- Single-slot IndexedDB caching for one accepted export, including persisted analysis and subject selection plus an explicit clear-cache control.
- Real GOBPFR agent profiles rendered from exported `dimension_scores.csv` and `dimension_intervals.csv`.
- Cross-agent dimension comparison rendered from the same selected analysis snapshot, with merged-radar and grouped-bar views.
- Availability summaries and trajectory summaries when those analysis tables are present.
- Source links from profile rows back to the exact exported analysis table.
- Paginated file inventory with filename search and file-type filtering.
- Decision Workshop with a persisted local function store, categorized presets, a bounded expression evaluator, merged canonical radar, conditional cross-agent ranking, and saved-parameter sensitivity sweeps.
- Recipe-defined parameter controls with optional min/max/step metadata and procedural number/slider rendering.
- Versioned local decision-recipe JSON import/export (`acmm-explorer-decision-recipe/0.1`).
- Failure-aware ingestion stages that mark the failed stage and block later stages visually.
- Reference-search shell for future generated CLI/schema documentation.
- No server-side storage, upload service, or external data processing.

The Overview page still contains a visibly marked synthetic profile. The Data Explorer uses real exported analysis values once a supported ACMM export ZIP is opened. Generated R plot images inside an export are inventoried but are not used by Explorer; frontend visualizations are rendered independently from the exported numeric tables. Raw execution-result folders are intentionally outside the viewer's scope.

## Run locally with Docker

From the repository root:

```bash

docker compose up --build
```

Then open:

```text
http://localhost:5173
```

Stop the development service with `Ctrl+C`, then remove the container with:

```bash

docker compose down
```

The source tree is bind-mounted into the development container. `node_modules` is kept in a Docker named volume so frontend dependencies do not need to be installed into the host repository.

## Optional host-native development

Docker is the expected workflow, but a compatible Node.js environment can run the project directly:

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run build
```

## Project layout

```text
src/
  app/              application shell, navigation, global styles
  components/       shared and top-level views
  data/             generic ingestion, package adapters, shared data types
  explorer/         experiment-data exploration UI
  decision/         decision-function model, presets, store, and expression evaluator
  workshop/         decision workshop UI
  reference/        CLI/schema/concept reference UI
  visualization/    chart components and visualization primitives
```

Data ingestion is separated under `src/data/`. Generic readers inventory and preview source files; version-aware adapters normalize supported exported ACMM analysis packages into the visualization model. The current adapter consumes only export and `analysis_output` artifacts, not raw execution data. It accepts both root-level export contents and the same contents nested beneath an experiment/execution or campaign/merge directory.

## Current frontend dependencies

- **React**: application UI.
- **TypeScript**: type-safe frontend implementation.
- **Vite**: local development server and build tooling.
- **Apache ECharts**: interactive plots and charts. The project uses ECharts directly rather than a React wrapper so chart lifecycle, capabilities, and upgrades remain under project control.
- **fflate**: local ZIP decompression for experiment-package inspection.
- **read-excel-file**: browser-side `.xlsx` reading for raw worksheet previews.
- **yaml**: browser-compatible YAML parsing for ACMM export and analysis manifests.

New substantial frontend libraries should be introduced only when a concrete feature needs them. The Decision Workshop currently uses no additional dependency: custom functions are stored in browser `localStorage`, and expressions are evaluated by a project-owned parser rather than JavaScript `eval`.

## Design rules

1. ACMM Explorer is a consumer of frozen experiment outputs; it does not modify Core or experiment packages.
2. User-selected experiment data is processed locally. At most one accepted export is cached in browser storage; a new accepted export replaces it.
3. Existing canonical ACMM values are preferred over reimplementation.
4. Display-derived values must remain traceable to their inputs.
5. New analytical interpretations must be explicitly separated from canonical ACMM results.
6. Demo data must be visibly marked and must never be confused with experiment evidence.
7. Interface copy should stay concise and functional. Richness belongs primarily in data views, tables, plots, filtering, and drill-down interactions rather than promotional or presentation-oriented text.
8. Decision Workshop outputs are conditional user-defined decision results, not canonical ACMM good/bad scores. Canonical profile values remain unchanged by workshop functions.

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.

## Decision Workshop

Parameter editor note: control metadata (control type, min, max, step) is kept in a per-parameter disclosure so routine symbol/label/value editing stays compact. The control metadata remains part of the persisted recipe and still drives the procedural editor.

The Decision Workshop keeps canonical ACMM evidence separate from user-defined preference logic. On desktop its top summary row uses three read-only views: canonical merged radar on the left, the selected saved decision function in the center, and the conditional ranking/result on the right. Full editing and analytical tools are stacked below that summary row.

- The merged compliance radar always renders unmodified exported point estimates.
- The top function summary always shows the last saved recipe. Draft edits live only in the full editor below it.
- A stored decision function is evaluated only when it is in a saved/locked state.
- Entering edit mode invalidates the visible ranking until the function is saved again.
- Presets are read-only and can be duplicated into custom functions.
- Parameter rows are generated from each recipe's declared parameter definitions; they are not hard-coded to a specific preset.
- Parameters may declare `min`, `max`, `step`, and `control` metadata. Slider controls are rendered only from that stored metadata; unknown expression identifiers still fail validation.
- Built-in presets are grouped by purpose (`Basic`, `Weighted`, `Constrained`) in the function selector.
- The expression parser resolves declared parameter symbols. Unknown identifiers fail validation rather than silently creating new parameters.
- Parameter and eligibility-rule lists use bounded inline scroll regions so large recipes do not make the page grow without limit.
- Eligibility rules are evaluated separately from the score and cannot be compensated by a high score on another dimension.
- The score comparison chart renders raw function output for eligible agents only; it does not normalize scores into percentages.
- Saved functions can be exported as versioned recipe JSON. Import validates the recipe and stores it as a new custom function rather than overwriting an existing entry.
- Bounded parameters (explicit `min` and `max`) can be inspected with a one-parameter sensitivity sweep. The sweep samples the saved function at 41 points while all other parameters remain fixed and does not modify the recipe.
- The top summary uses three columns on wide screens, two columns at intermediate widths, and one column on narrow screens. The full editor and sensitivity tools remain vertically stacked beneath it.
