#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server exec tsx src/scripts/loadTuitionSnapshots.ts
