# Example ACMM Exports

This directory contains two frozen ACMM export packages that can be opened directly in ACMM Explorer:

- `experiment-1-exported.zip`
- `experiment-2-exported.zip`

These files are intended as sample inputs for trying the local Data Explorer and Decision Workshop without running an experiment first.

## Experiment 1

`experiment-1-exported.zip` contains the exported analyzed results from the earlier ACMM experiment workflow.

It uses the older run-based export layout and is useful for testing Explorer compatibility with legacy analysis output.

## Experiment 2

`experiment-2-exported.zip` contains the exported analyzed results from the newer campaign-based workflow.

It includes multiple analysis snapshots and is useful for testing analysis selection, profile views, detailed analysis views, and the Decision Workshop.

## Usage

Start ACMM Explorer:

```bash
cd ~/acmm_explorer
./scripts/dev.sh
```

Then open **Data Explorer** and select either ZIP file.

The example exports are analyzed/exported data packages. They are not raw execution-data archives, and ACMM Explorer does not require raw execution data for these examples.
