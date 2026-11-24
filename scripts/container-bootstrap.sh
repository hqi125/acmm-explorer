#!/bin/sh
set -eu

# /workspace is bind-mounted during local development, which hides any
# /workspace/node_modules directory installed into the image. Both long-lived
# and one-shot Node jobs therefore reconcile the shared dependency volume
# before launching their actual entry point.
npm install --no-audit --no-fund
exec "$@"
