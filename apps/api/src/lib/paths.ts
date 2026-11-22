import { existsSync } from "node:fs";
import path from "node:path";

let cached: string | undefined;

/**
 * The repository root (the folder containing pnpm-workspace.yaml), found by
 * walking up from the working directory. Falls back to the working directory
 * when the server runs outside the repository (for example a copied bundle).
 */
export function repoRoot(): string {
  if (cached) return cached;
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return (cached = dir);
    const parent = path.dirname(dir);
    if (parent === dir) return (cached = process.cwd());
    dir = parent;
  }
}

export const repoPath = (...parts: string[]) => path.join(repoRoot(), ...parts);
