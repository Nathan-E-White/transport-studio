#!/usr/bin/env node
import { resolve } from "node:path";
import { bytesForPath, CARGO_CACHES, formatBytes, freeDiskBytes, inspectWorktree, parseWorktreePorcelain, run, sumCategory } from "./hygiene-lib.mjs";

const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);
const items = parseWorktreePorcelain(run("git", ["worktree", "list", "--porcelain"])).map((record) => inspectWorktree(repoRoot, record));
console.log("Transport Studio hygiene size report (read-only)");
console.log(`repository: ${repoRoot}`);
console.log(`free disk: ${formatBytes(freeDiskBytes(repoRoot))}`);
console.log(`repository checkout: ${formatBytes(bytesForPath(repoRoot))}`);
console.log("\nRegistered worktrees");
for (const item of items) {
  console.log(`- ${item.path}`);
  console.log(`  branch=${item.branch ?? "detached"} state=${item.dirty ? "dirty" : "clean"} merge=${item.mergeState} upstream=${item.upstream} divergence=${item.upstreamState} size=${formatBytes(item.bytes)}`);
  if (item.generated.length === 0) console.log("  generated/dependencies: skipped (none present)");
  for (const entry of item.generated) console.log(`  ${entry.category}/${entry.relative}: ${formatBytes(entry.bytes)}`);
}
console.log("\nCategory totals");
for (const category of ["dependencies", "rust-targets", "generated"]) console.log(`- ${category}: ${formatBytes(sumCategory(items, category))}`);
console.log("\nNamed external Cargo caches");
for (const [role, path] of Object.entries(CARGO_CACHES)) console.log(`- ${role} ${resolve(path)}: ${formatBytes(bytesForPath(resolve(path)))}`);
