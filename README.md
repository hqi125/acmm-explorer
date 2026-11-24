# acmm-explorer

Local-only experiment-data explorer and usage reference for the Agent Compliance Metric Model (ACMM).

ACMM Explorer is separate from the frozen ACMM research and experiment repositories. It is a read-only working interface for opening analyzed experiment exports, inspecting normalized results, applying explicit decision functions, and looking up ACMM schemas, experiment-package structure, commands, fields, and project concepts.

The application runs locally. Experiment exports are processed in the browser; no upload service or server-side data store is used.

## Main areas

### Overview

Overview reflects the active export session. When a normalized analysis is loaded, it shows the selected export/analysis context and a merged canonical GOBPFR radar for the available agents. When no export is active, the radar is omitted.

Overview, Data Explorer, and Decision Workshop share one application-level export session, so cache restoration, ZIP inspection, adapter detection, and normalization are not repeated when navigating between pages. Shared loading status remains visible while loading continues.

### Data Explorer

Data Explorer accepts analyzed ACMM export ZIPs and normalizes supported layouts through version-aware adapters.

Supported export structures include:

- legacy `acmm run` exports with direct `analysis_output/data/...` content;
- campaign exports with versioned `analysis_output/analysis_<id>/...` snapshots;
- exports whose contents are either at the ZIP root or nested below execution/campaign directories.

When multiple analysis snapshots are present, the user selects the analysis to inspect and can switch analyses afterward.

The normalized viewer includes:

- **Profile**: GOBPFR agent profiles, confidence intervals, and cross-agent radar/bar comparisons;
- **Requirements**: requirement-level estimates and intervals with available estimand selection;
- **Availability**: final and first-attempt availability, retry/recovery evidence, scenario summaries, and failure modes;
- **Trajectory**: exported subject/tool/run trajectory summaries when the analysis provides them;
- **File inventory**: paginated filename search, file-type filters, and previews for supported CSV/JSON/XLSX/text content.

Source links from analyzed views return to the corresponding exported table in the file inventory. R-generated plot images contained in an export are inventoried but are not used for frontend charts; Explorer renders numeric exported data independently with ECharts.

Raw execution-result folders are intentionally outside the viewer's scope.

### Decision Workshop

Decision Workshop keeps canonical ACMM evidence separate from user-defined preference logic. It does not change the underlying GOBPFR profiles and does not turn ACMM itself into an intrinsic good/bad ranking model.

The top summary presents:

- the canonical merged compliance radar;
- the selected saved decision function;
- the conditional ranking/result produced by that function.

The full editor and analytical tools are stacked below the summary. Decision recipes support:

- a bounded expression language over `goal`, `obligation`, `boundary`, `procedure`, `fidelity`, and `recovery`;
- declared numeric parameters with procedural number/slider controls;
- optional parameter groups, including sum-to-one normalization;
- hard eligibility rules evaluated separately from scoring;
- point-estimate or lower-confidence-bound evidence modes;
- availability as an eligibility metric without treating it as a seventh GOBPFR dimension;
- local custom-function persistence and versioned recipe import/export;
- one-parameter sensitivity sweeps with approximate ranking-change detection;
- side-by-side comparison of two saved decision functions using rank movement rather than assuming different function outputs share a common scale.

Saved recipes are evaluated only in their committed state. Editing invalidates dependent results until the recipe is saved or the edit is cancelled. Presets remain read-only and can be duplicated into editable custom functions.

Expressions are parsed by the project-owned evaluator rather than JavaScript `eval`. Unknown identifiers fail validation rather than silently becoming parameters.

#### Parameter groups

A parameter may optionally belong to a group. Supported policies are:

- `none`: pass saved raw values to the expression unchanged;
- `sum-to-one`: divide each member's raw value by the group's raw total before expression evaluation.

Normalization does not rewrite saved raw values. The editor can show both raw and effective values. A sum-to-one group must contain at least one parameter and cannot have a zero raw total.

### Reference

Reference is a hierarchical local reference book rather than a flat list. Its tree separates project-wide material, experiment-specific material, and Explorer-local concepts.

It covers:

- ACMM commands and concepts;
- source-generated Core JSON Schemas and individual schema fields;
- experiment packages discovered from `experiment.yaml` and `experiment-package.yaml`;
- package YAML fields;
- observed export/analysis data artifacts and fields;
- Explorer-local concepts such as decision recipes.

Generated JSON Schema fields and observed/package fields are first-class searchable entries with their own detail routes. Reference navigation supports browser-style Back/Forward history and copyable links.

Search can be narrowed with name/path-only matching, source-file exclusions, and top-level hierarchy exclusions. Field detail pages can seed a related-field search without asserting a hard-coded YAML-to-schema mapping.

On desktop, the tree and detail panes use a bounded workspace and scroll independently. Large field collections are also internally scrollable.

## Run locally with Docker

From the repository root:

```bash
./scripts/dev.sh
```

Then open:

```text
http://localhost:5173
```

The helper performs the normal local startup flow:

1. refresh the source-backed reference catalog when the sibling ACMM source repositories are available;
2. ensure the shared local development image exists;
3. start the Explorer service with Docker Compose;
4. reconcile frontend dependencies in the Docker-managed `node_modules` volume;
5. run Vite as the container foreground process.

Stop with `Ctrl+C`. Docker Compose owns the normal SIGINT shutdown path; after Compose returns, the helper runs `docker compose down --remove-orphans`. The named dependency volume is retained.

Normal startup reuses the local development image. Force an image rebuild only when needed:

```bash
./scripts/dev.sh --build
```

Start without refreshing the reference catalog:

```bash
./scripts/dev.sh --skip-reference
```

## Source-generated reference catalog

The default WSL layout is three sibling repositories:

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

`.env.example` exposes these as:

```text
ACMM_CORE_REPO=../acmm_repo
ACMM_EXPERIMENTS_REPO=../acmm_experiments
```

Relative paths are normalized from the logical Explorer path before following symlinks. Absolute paths are also accepted.

Generate the source-backed catalog explicitly with:

```bash
./scripts/reference-import.sh
```

Force a development-image rebuild for the importer only when needed:

```bash
./scripts/reference-import.sh --build
```

The source repositories are mounted read-only into the disposable importer container. The importer:

- discovers JSON Schema documents and locally resolves `$ref` targets where possible;
- records schema/source provenance, repository commit, file SHA-256, types, defaults, enums, constraints, JSON pointers, and fields declared under `$defs` / `definitions`;
- discovers exact experiment-package root files named `experiment.yaml` and `experiment-package.yaml`;
- groups package YAML files by package directory and indexes nested YAML field paths, including fields inside arrays of objects.

Experiment package YAML is treated as concrete schema-consuming configuration, not as JSON Schema.

The generated catalog is written to:

```text
src/reference/generated/schema-catalog.json
```

The running website reads the generated catalog and does not require the Core or Experiments repositories at runtime. If either source repository is unavailable during normal startup, Explorer continues using the last generated catalog.

## Local data lifecycle

User-selected experiment data stays local to the browser session/storage.

Explorer keeps at most one accepted export in IndexedDB. Opening another accepted export replaces the cached copy. The selected analysis and subject are persisted with that cached export, and the cache can be cleared from the UI.

A shared application session owns the active export load. Navigation does not start duplicate normalization work. If a newer export load begins while an older one is still running, stale results from the older operation are ignored.

Page-local work, such as individual file previews, remains local to the requesting page and ignores superseded results.

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
  data/             ingestion, package adapters, shared export session, cache, and data types
  explorer/         experiment-data exploration UI
  decision/         decision-function model, presets, store, and expression evaluator
  workshop/         decision workshop UI
  reference/        reference UI, curated catalog, and generated source catalog
  visualization/    chart components and visualization primitives
```

Supporting scripts under `scripts/` handle Docker startup, dependency bootstrap, image reuse, and source-reference generation.

## Frontend dependencies

- **React**: application UI.
- **TypeScript**: type-safe frontend implementation.
- **Vite**: local development server and build tooling.
- **Apache ECharts**: interactive plots and charts, used directly rather than through a React wrapper.
- **fflate**: browser-local ZIP decompression.
- **read-excel-file**: browser-side `.xlsx` previews.
- **yaml**: YAML parsing for ACMM manifests and reference-source import.

The Decision Workshop does not use a separate expression-evaluation dependency; its parser/evaluator is implemented in the project.

## Design principles

1. ACMM Explorer is a consumer of frozen ACMM outputs and source definitions; it does not modify Core or experiment packages.
2. Experiment data is processed locally. No upload service or external analytical backend is required.
3. Canonical ACMM values are preferred over reimplementation.
4. Display-derived values remain traceable to their exported inputs.
5. New decision interpretations are explicitly separated from canonical ACMM results.
6. Canonical radar/profile visualizations are not reshaped by Decision Workshop preferences.
7. Missing analysis data is reported as unavailable rather than reconstructed from raw execution data.
8. Reference generation distinguishes what source schemas permit from what a particular export happened to contain.
9. Interface text stays concise and functional; richer presentation belongs in tables, plots, filtering, and drill-down interactions.

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.
