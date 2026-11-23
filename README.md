# acmm-explorer

Local-only experiment-data explorer and usage reference for the Agent Compliance Metric Model (ACMM).

ACMM Explorer is intentionally separate from the frozen ACMM research and experiment repositories. It is a local, read-only working interface: experiment outputs are opened locally, normalized by version-aware adapters, inspected through tables and visualizations, and linked back to their source evidence. The reference area provides a searchable lookup surface for ACMM commands, schemas, and project concepts.

## Current status

The project is at its first application scaffold. The current build includes:

- React + TypeScript + Vite frontend foundation.
- Docker-contained development environment.
- Apache ECharts integration with a synthetic GOBPFR radar profile.
- Local file-selection and drag/drop boundary for future ACMM package ingestion.
- Reference-search shell for future generated CLI/schema documentation.
- No server-side storage, upload service, or external data processing.

The radar data and reference entries currently visible in the UI are explicitly placeholder/demo content. They are not experiment results or authoritative ACMM documentation.

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
  explorer/         experiment-data exploration UI
  reference/        CLI/schema/concept reference UI
  visualization/    chart components and visualization primitives
```

Future data work will add a separate ingestion/adapter/model layer rather than teaching individual pages to read ACMM files directly.

## Current frontend dependencies

- **React**: application UI.
- **TypeScript**: type-safe frontend implementation.
- **Vite**: local development server and build tooling.
- **Apache ECharts**: interactive plots and charts. The project uses ECharts directly rather than a React wrapper so chart lifecycle, capabilities, and upgrades remain under project control.

New substantial frontend libraries should be introduced only when a concrete feature needs them.

## Design rules

1. ACMM Explorer is a consumer of frozen experiment outputs; it does not modify Core or experiment packages.
2. User-selected experiment data is processed locally.
3. Existing canonical ACMM values are preferred over reimplementation.
4. Display-derived values must remain traceable to their inputs.
5. New analytical interpretations must be explicitly separated from canonical ACMM results.
6. Demo data must be visibly marked and must never be confused with experiment evidence.
7. Interface copy should stay concise and functional. Richness belongs primarily in data views, tables, plots, filtering, and drill-down interactions rather than promotional or presentation-oriented text.

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.
