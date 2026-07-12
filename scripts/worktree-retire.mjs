#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { assertInside, freeDiskBytes, formatBytes, inspectWorktree, parseWorktreePorcelain, planRetirement, run, tryRun } from "./hygiene-lib.mjs";

function parseArgs(argv) {
  const options = { execute: false, archiveDir: resolve("../archives/worktrees"), worktrees: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") options.execute = true;
    else if (arg === "--archive-dir" && argv[index + 1]) options.archiveDir = resolve(argv[++index]);
    else if (arg === "--worktree" && argv[index + 1]) options.worktrees.push(resolve(argv[++index]));
    else throw new Error(`unknown or incomplete argument: ${arg}`);
  }
  if (options.worktrees.length === 0) throw new Error("at least one --worktree PATH is required");
  return options;
}

function archiveDirty(item, archiveRoot) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const destination = assertInside(archiveRoot, resolve(archiveRoot, `${basename(item.path)}-${stamp}-${item.head.slice(0, 8)}`));
  if (existsSync(destination)) throw new Error(`archive destination already exists: ${destination}`);
  mkdirSync(archiveRoot, { recursive: true });
  mkdirSync(destination, { recursive: false });
  const unique = run("git", ["-C", item.path, "rev-list", `origin/main..${item.head}`]).split("\n").filter(Boolean);
  writeFileSync(resolve(destination, "manifest.txt"), [`path=${item.path}`, `branch=${item.branch}`, `head=${item.head}`, `unique_commits=${unique.length}`, `size=${item.bytes}`, `archived_at=${new Date().toISOString()}`, ""].join("\n"));
  writeFileSync(resolve(destination, "status.txt"), `${run("git", ["-C", item.path, "status", "--short", "--branch"])}\n`);
  writeFileSync(resolve(destination, "staged.patch"), run("git", ["-C", item.path, "diff", "--cached", "--binary"]));
  writeFileSync(resolve(destination, "unstaged.patch"), run("git", ["-C", item.path, "diff", "--binary"]));
  const untracked = run("git", ["-C", item.path, "ls-files", "--others", "--exclude-standard"]);
  writeFileSync(resolve(destination, "untracked.txt"), `${untracked}\n`);
  for (const relative of untracked.split("\n").filter(Boolean)) {
    const target = assertInside(resolve(destination, "untracked"), resolve(destination, "untracked", relative));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(item.path, relative), target, { recursive: true, preserveTimestamps: true });
  }
  const bundle = resolve(destination, "commits.bundle");
  run("git", ["-C", item.path, "bundle", "create", bundle, item.branch]);
  run("git", ["bundle", "verify", bundle]);
  const bundledHeads = run("git", ["bundle", "list-heads", bundle]);
  if (!bundledHeads.includes(item.head)) throw new Error(`bundle does not contain worktree HEAD: ${item.head}`);
  return destination;
}

const options = parseArgs(process.argv.slice(2));
const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);
if (options.execute) run("git", ["fetch", "--prune", "origin"]);
const listed = parseWorktreePorcelain(run("git", ["worktree", "list", "--porcelain"]));
const primary = resolve(listed[0].path);
const records = new Map(listed.map((item) => [resolve(item.path), item]));
const before = freeDiskBytes(repoRoot);
console.log(`mode: ${options.execute ? "execute (origin refreshed)" : "dry-run (local refs only)"}`);
for (const selected of options.worktrees) {
  const record = records.get(selected);
  const item = record ? inspectWorktree(repoRoot, record) : null;
  const classification = planRetirement(primary, Boolean(record), selected, item ?? {});
  console.log(`${selected}: ${classification}; size=${formatBytes(item.bytes)}`);
  console.log(`  archive=${resolve(options.archiveDir, basename(selected))}-<timestamp>-<head>`);
  console.log("  action=git worktree remove (branch retained)");
  if (!options.execute) continue;
  if (item.dirty) archiveDirty(item, options.archiveDir);
  const result = tryRun("git", ["worktree", "remove", ...(item.dirty ? ["--force"] : []), selected]);
  if (!result.ok) throw new Error(`worktree removal failed: ${selected}: ${result.error}`);
}
if (options.execute) run("git", ["worktree", "prune"]);
const after = freeDiskBytes(repoRoot);
console.log(`free-before=${formatBytes(before)} free-after=${formatBytes(after)} reclaimed=${formatBytes(before !== null && after !== null ? after - before : null)}`);
console.log("remaining worktrees:");
console.log(run("git", ["worktree", "list"]));
console.log(`primary-untracked=${run("git", ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean).length}`);
console.log(`tracked-but-ignored=${run("git", ["ls-files", "-ci", "--exclude-standard"]).split("\n").filter(Boolean).length}`);
