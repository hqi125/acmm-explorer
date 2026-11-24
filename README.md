# acmm-explorer

Local-only experiment-data explorer and usage reference for the Agent Compliance Metric Model (ACMM).

ACMM Explorer is intentionally separate from the frozen ACMM research and experiment repositories. It is a local, read-only working interface: experiment outputs are opened locally, normalized by version-aware adapters, inspected through tables and visualizations, and linked back to their source evidence. The reference area provides a searchable lookup surface for ACMM commands, source JSON Schemas, observed data artifacts, fields, and project concepts.

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
- Decision Workshop with a persisted local function store, categorized presets, a bounded expression evaluator, merged canonical radar, conditional cross-agent ranking, normalized parameter groups, uncertainty-aware evidence selection, availability-aware eligibility rules, and saved-parameter sensitivity sweeps.
- Recipe-defined parameter controls with optional min/max/step metadata, procedural number/slider rendering, and optional parameter-group transforms such as sum-to-one normalization.
- Versioned local decision-recipe JSON import/export (`acmm-explorer-decision-recipe/0.3`), with backward-compatible import of `0.1` and `0.2` recipes.
- Failure-aware ingestion stages that mark the failed stage and block later stages visually.
- Structured Reference catalog with distinct JSON Schema and observed-data-artifact filters, first-class field detail routes, source provenance, related-entry navigation, history controls, and copyable definition metadata.
- No server-side storage, upload service, or external data processing.

The Overview page still contains a visibly marked synthetic profile. The Data Explorer uses real exported analysis values once a supported ACMM export ZIP is opened. Generated R plot images inside an export are inventoried but are not used by Explorer; frontend visualizations are rendered independently from the exported numeric tables. Raw execution-result folders are intentionally outside the viewer's scope.

## Run locally with Docker

From the repository root:

```bash
./scripts/dev.sh
```

Then open:

```text
http://localhost:5173
```

`dev.sh` performs the local startup jobs in order:

1. If both sibling ACMM source repositories are available, regenerate the source-backed JSON Schema reference catalog.
2. Ensure one shared local Explorer dev image exists; ordinary launches reuse it instead of rebuilding.
3. Run the normal `docker compose up explorer` service lifecycle.
4. Install/reconcile frontend dependencies inside the named `node_modules` volume.
5. Launch Vite directly as the container foreground process.

Stop with `Ctrl+C`. The helper deliberately does not intercept SIGINT: Docker Compose owns the same shutdown path as the known-good manual `docker compose up` command. After Compose returns, an EXIT cleanup runs `docker compose down --remove-orphans`, removing the stopped Explorer service container and project network. The named `node_modules` volume is intentionally retained because cleanup does not use `-v`. Vite is executed directly rather than through `npm run dev`, so normal Ctrl+C shutdown is not routed through an npm script.

Normal startup does **not** rebuild the Docker image. Source is bind-mounted and frontend dependencies are reconciled at container startup, so repeatedly rebuilding only adds unnecessary registry access. Force a rebuild only when needed:

```bash
./scripts/dev.sh --build
```

If an older Explorer Compose image already exists locally, the helper automatically retags and reuses it as `acmm-explorer-dev:local` on the first v0.18.2 launch. Both the Explorer and reference-import services share this one local image.

To start the site without refreshing the reference catalog:

```bash
./scripts/dev.sh --skip-reference
```

### Source-generated schema reference

The default sibling-repository layout under `~/` is:

```text
~/acmm_repo
~/acmm_experiments
~/acmm_explorer
```

From the Explorer repository root the defaults are therefore:

```text
../acmm_repo
../acmm_experiments
```

`.env.example` documents those paths as `ACMM_CORE_REPO` and `ACMM_EXPERIMENTS_REPO`. Relative values are normalized lexically from the logical Explorer path before any symlink is followed; for the default WSL layout this yields `/home/<user>/acmm_repo` and `/home/<user>/acmm_experiments`. Absolute paths are also accepted.

Generate the schema book explicitly with:

```bash
./scripts/reference-import.sh
```

The importer also reuses the shared local dev image. Use `./scripts/reference-import.sh --build` only when an explicit image rebuild is wanted.

The helper resolves the source paths on the host, mounts both repositories read-only into a disposable `reference-import` container, discovers JSON Schema documents, resolves local/relative `$ref` targets where possible, and writes:

```text
src/reference/generated/schema-catalog.json
```

The generated catalog contains source-repository/commit provenance, schema file SHA-256 values, schema metadata, and searchable property records including nested object/array fields and fields declared inside `$defs` / `definitions`. The running website reads only the generated catalog; it does not require the Core or Experiments repositories at runtime.

`./scripts/dev.sh` invokes the importer in `--if-available` mode. If either sibling repository is absent, startup continues with the last committed generated catalog.

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
  reference/        CLI/schema/concept reference UI and generated schema catalog
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

### Parameter groups and effective values

A recipe can declare parameter groups separately from its parameters. Each parameter may optionally reference one group. The current policies are:

- `none`: pass the saved raw parameter values to the expression unchanged.
- `sum-to-one`: divide each member's raw value by the group's raw total before expression evaluation.

Normalization never rewrites the saved raw values. The editor shows raw values as the editable controls and displays an effective value when a parameter belongs to a sum-to-one group. The saved-function summary likewise identifies normalized values and their raw source values. A sum-to-one group must contain at least one parameter and cannot have a zero raw total.

The built-in `Weighted linear profile` preset uses a `weights` group with sum-to-one normalization and therefore evaluates a direct weighted sum over the six GOBPFR dimensions. Existing custom recipes created by older Explorer versions are migrated with no parameter groups, preserving their earlier behavior.

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
- Built-in presets are grouped by purpose (`Basic`, `Weighted`, `Constrained`, `Risk-aware`) in the function selector.
- The expression parser resolves declared parameter symbols. Unknown identifiers fail validation rather than silently creating new parameters.
- Parameter and eligibility-rule lists use bounded inline scroll regions so large recipes do not make the page grow without limit.
- Each recipe explicitly selects its decision evidence basis: exported point estimates or lower confidence bounds. The canonical radar always remains on point estimates.
- Eligibility rules are evaluated separately from the score and cannot be compensated by a high score on another dimension. Dimension rules use the recipe evidence basis; availability rules use the exported analysis availability metric.
- The score comparison chart renders raw function output for eligible agents only; it does not normalize scores into percentages.
- Saved functions can be exported as versioned recipe JSON. Import validates the recipe and stores it as a new custom function rather than overwriting an existing entry.
- Bounded parameters (explicit `min` and `max`) can be inspected with a one-parameter sensitivity sweep. The sweep samples the saved raw parameter at 41 points while all other raw parameters remain fixed, reapplies parameter-group normalization at each sample, and does not modify the recipe.
- Sensitivity results detect approximate pairwise score crossings and report where the ordering changes as the selected parameter increases.
- The top summary uses three columns on wide screens, two columns at intermediate widths, and one column on narrow screens. The full editor and sensitivity tools remain vertically stacked beneath it.


### Decision evidence and uncertainty

Decision recipes choose how the six GOBPFR variables are populated before the expression is evaluated:

- `point-estimate`: use each exported dimension score. This remains the default for existing recipes.
- `lower-confidence-bound`: use each exported dimension interval lower bound. If a required lower bound is unavailable, that subject is reported as unavailable for the decision rather than silently falling back to the point estimate.

The selected evidence basis also applies to dimension-based eligibility rules. Availability is deliberately separate from GOBPFR and can be used only as an eligibility metric; it is not introduced as a seventh compliance dimension. The sensitivity sweep uses the same saved evidence basis as the active recipe.

## v0.15 decision comparison

The Decision Workshop includes a saved-recipe comparison section below parameter sensitivity. Two stored decision recipes can be applied to the same active analysis. The comparison focuses on eligible ranking position rather than treating raw outputs from different functions as a shared numeric scale. A rank-movement chart shows positional changes, while the adjacent table retains each recipe's raw output and eligibility result for audit.


## v0.16 analyzed export detail views

The normalized Data Explorer now exposes four linked analysis views for the selected analysis snapshot and subject: `Profile`, `Requirements`, `Availability`, and `Trajectory`. Requirements are read from exported `requirement_estimates.csv` / `requirement_intervals.csv` and can switch among available estimands. Availability uses scenario cells, subject intervals, and recorded failure-mode tables. Trajectory uses only exported trajectory subject/tool/run tables; older analyses without those tables display an explicit unavailable state rather than reconstructing behavior from raw run data. All charts remain frontend renderings of exported numeric tables, and table source links continue to jump to the corresponding file in the export inventory.


## v0.17 reference catalog

The Reference page is now a structured local catalog rather than placeholder cards. It separates three source bases: entries observed directly in the supplied analyzed export packages, project-context entries whose exhaustive frozen-source option/schema inventory is still pending, and Explorer-local concepts such as decision recipes. Observed CSV field lists are taken from the supplied Experiment 1 and Experiment 2 exports. Command entries intentionally avoid claiming an exhaustive option list until the frozen Core/experiment source repositories are imported. The catalog model lives in `src/reference/catalog.ts` so a future source importer can replace or enrich entries without coupling reference data to the React view.


## v0.18 source-generated schema catalog

The Reference database now has a generated source layer in addition to curated project-context and observed-export entries. `scripts/reference-import.mjs` recursively scans the read-only Core and Experiments source trees for JSON Schema documents while excluding build/cache/result directories. Each discovered schema becomes a searchable `Schema` entry and each property becomes a searchable `Field` entry. Field records preserve canonical instance/definition path, JSON pointer, type, required/conditional status, default/const/enum/format/constraints, `$ref`, source file, repository source, and schema/file provenance. Fields declared only inside `$defs` or legacy `definitions` are retained with definition-qualified paths so the schema book is not limited to fields observed in a specific experiment export.

Generated source data and observed export data are intentionally separate: the generated schema book answers what the frozen source permits, while analyzed-export entries describe what was present in the supplied experiment output.

## v0.19 reference navigation and field pages

Reference entries now distinguish source-generated `JSON Schema` definitions from observed YAML/CSV `Data Artifact` structures. Every generated or observed field is a first-class searchable `Field` entry with its own `#/reference/<entry-id>` route. Schema/artifact field lists navigate by clicking the field row itself; the old `Open` action is removed. Reference navigation writes browser history entries and exposes Back, Forward, and Copy link controls so direct field links and related-entry traversal remain consistent. Observed fields retain their artifact provenance, while generated fields retain JSON Schema source/constraint provenance.

