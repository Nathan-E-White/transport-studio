#!/usr/bin/env node
import { resolve } from "node:path";
import { bytesForPath,formatBytes,freeDiskBytes,inspectWorktree,parseWorktreePorcelain,run } from "./hygiene-lib.mjs";
const repoRoot=run("git",["rev-parse","--show-toplevel"]); const records=parseWorktreePorcelain(run("git",["worktree","list","--porcelain"]));
const namedCaches=[process.env.TRANSPORT_CARGO_TARGET_DEV??"/tmp/transport-studio-cargo-target/dev",process.env.TRANSPORT_CARGO_TARGET_BUILD??"/tmp/transport-studio-cargo-target/build",process.env.TRANSPORT_CARGO_TARGET_TEST??"/tmp/transport-studio-cargo-target/test"];
console.log("Transport Studio hygiene size report (read-only)"); console.log(`repository: ${repoRoot}`); console.log(`free disk: ${formatBytes(freeDiskBytes(repoRoot))}`); console.log(`repository checkout: ${formatBytes(bytesForPath(repoRoot))}`); console.log("\nRegistered worktrees");
for(const record of records){const item=inspectWorktree(repoRoot,record); console.log(`- ${item.path}`); console.log(`  branch=${item.branch} state=${item.dirty?"dirty":"clean"} merged=${item.merged?"yes":"no"} upstream=${item.upstream} size=${formatBytes(item.bytes)}`); if(item.generated.length===0)console.log("  generated/dependencies: skipped (none present)"); for(const entry of item.generated)console.log(`  ${entry.relative}: ${formatBytes(entry.bytes)}`);}
console.log("\nNamed external Cargo caches"); for(const path of namedCaches.map((entry)=>resolve(entry)))console.log(`- ${path}: ${formatBytes(bytesForPath(path))}`);
