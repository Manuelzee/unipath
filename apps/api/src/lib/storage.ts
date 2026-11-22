import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import { repoPath } from "./paths";

/**
 * Private object storage on the local filesystem.
 *
 * Objects live under STORAGE_DIR (default: <repo>/.data/storage), which must
 * never be served directly; every read goes through an API route that checks
 * access first. Keys are validated so a key can never escape the root.
 * To use cloud storage instead, implement the same three functions for S3/R2.
 */
export function storageRoot() {
  return process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : repoPath(".data", "storage");
}

const SAFE_KEY = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_.-]*)+$/i;

export function objectPath(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("Invalid storage object key.");
  const root = storageRoot();
  const full = path.resolve(root, ...key.split("/"));
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage object key.");
  return full;
}

export async function objectExists(key: string) {
  try { return (await stat(objectPath(key))).isFile(); } catch { return false; }
}

export function readObject(key: string): Readable {
  return createReadStream(objectPath(key));
}

/** Writes atomically (temp file + rename). Existing objects are kept when `overwrite` is false. */
export async function writeObject(key: string, bytes: Buffer, { overwrite = false } = {}) {
  const target = objectPath(key);
  if (!overwrite && (await objectExists(key))) return;
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, bytes, { flag: "wx" });
  await rename(temp, target);
}

export async function deleteObject(key: string) {
  await rm(objectPath(key), { force: true });
}
