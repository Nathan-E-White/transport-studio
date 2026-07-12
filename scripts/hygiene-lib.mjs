import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

export const GENERATED_PATHS = [
  ["dependencies", "node_modules"],
  ["dependencies", "apps/studio/node_modules"],
  ["rust-targets", "apps/studio/src-tauri/target"],
  ["generated", "dist"],
  ["generated", "coverage"],
  ["generated", "playwright-report"],
  ["generated", "test-results"],
  ["generated", ".vite"],
];

export const CARGO_CACHES = {
  dev: process.env.TRANSPORT_CARGO_TARGET_DEV ?? "/tmp/transport-studio-cargo-target/dev",
  build: process.env.TRANSPORT_CARGO_TARGET_BUILD ?? "/tmp/transport-studio-cargo-target/build",
  test: process.env.TRANSPORT_CARGO_TARGET_TEST ?? "/tmp/transport-studio-cargo-target/test",
};

export function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

export function tryRun(command, args, options = {}) {
  try { return { ok: true, output: run(command, args, options) }; }
  catch (error) { return { ok: false, output: "", error: error instanceof Error ? error.message : String(error) }; }
}

export function parseWorktreePorcelain(text) {
  const records = [];
  let current;
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) records.push(current);
      current = { path: line.slice(9), branch: null, head: "" };
    } else if (current && line.startsWith("HEAD ")) current.head = line.slice(5);
    else if (current && line.startsWith("branch refs/heads/")) current.branch = line.slice(18);
  }
  if (current) records.push(current);
  return records;
}

export function bytesForPath(path) {
  if (!existsSync(path)) return null;
  const result = tryRun("du", ["-sk", path]);
  if (!result.ok) return null;
  const kib = Number(result.output.split(/\s+/)[0]);
  return Number.isFinite(kib) ? kib * 1024 : null;
}

export function formatBytes(bytes) {
  if (bytes === null) return "skipped";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function mergeState(repoRoot, head, integrationRef = "origin/main") {
  if (!tryRun("git", ["-C", repoRoot, "rev-parse", "--verify", integrationRef]).ok) return "unavailable";
  return tryRun("git", ["-C", repoRoot, "merge-base", "--is-ancestor", head, integrationRef]).ok ? "merged" : "unmerged";
}

export function inspectWorktree(repoRoot, record, integrationRef = "origin/main") {
  const status = tryRun("git", ["-C", record.path, "status", "--porcelain"]);
  const upstream = tryRun("git", ["-C", record.path, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const divergence = upstream.ok ? tryRun("git", ["-C", record.path, "rev-list", "--left-right", "--count", `HEAD...${upstream.output}`]) : { ok: false, output: "" };
  const generated = GENERATED_PATHS.map(([category, relative]) => ({ category, relative, bytes: bytesForPath(resolve(record.path, relative)) }));
  return {
    ...record,
    dirty: !status.ok || status.output.length > 0,
    statusAvailable: status.ok,
    upstream: upstream.ok ? upstream.output : "none",
    upstreamState: divergence.ok ? divergence.output.replace("\t", " ahead/behind ") : "unavailable",
    mergeState: mergeState(repoRoot, record.head, integrationRef),
    bytes: bytesForPath(record.path),
    generated,
  };
}

export function sumCategory(items, category) {
  return items.flatMap((item) => item.generated).filter((entry) => entry.category === category && entry.bytes !== null).reduce((sum, entry) => sum + entry.bytes, 0);
}

export function assertInside(parent, child) {
  const root = resolve(parent);
  const target = resolve(child);
  if (target !== root && !target.startsWith(`${root}/`)) throw new Error(`path escapes archive root: ${child}`);
  return target;
}

export function physicalPath(path) {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}

export function freeDiskBytes(path) {
  const result = tryRun("df", ["-k", path]);
  if (!result.ok) return null;
  const kib = Number(result.output.split("\n").at(-1)?.trim().split(/\s+/)[3]);
  return Number.isFinite(kib) ? kib * 1024 : null;
}

export function planRetirement(primary, registered, selected, item) {
  if (physicalPath(selected) === physicalPath(primary)) throw new Error("refusing to retire the primary checkout");
  if (!registered) throw new Error(`unknown or unregistered worktree: ${selected}`);
  if (!item.statusAvailable) throw new Error(`cannot inspect worktree status: ${selected}`);
  if (item.mergeState === "unavailable") throw new Error("integration ref is unavailable");
  if (!item.dirty && item.mergeState !== "merged") throw new Error(`clean worktree is not merged into origin/main: ${selected}`);
  if (item.dirty && !item.branch) throw new Error(`dirty detached worktree requires manual preservation: ${selected}`);
  return item.dirty ? "archive-required" : "clean-merged";
}
