import { describe, expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertInside, formatBytes, mergeState, parseWorktreePorcelain, planRetirement, sumCategory } from "./hygiene-lib.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

describe("hygiene reporting", () => {
  test("parses attached and detached worktrees", () => {
    expect(parseWorktreePorcelain("worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /tmp/w\nHEAD def\ndetached\n")).toEqual([
      { path: "/repo", head: "abc", branch: "main" },
      { path: "/tmp/w", head: "def", branch: null },
    ]);
  });
  test("represents missing paths and low disk values", () => {
    expect(formatBytes(null)).toBe("skipped");
    expect(formatBytes(512)).toBe("512 B");
  });
  test("totals storage categories", () => {
    expect(sumCategory([{ generated: [{ category: "dependencies", bytes: 10 }, { category: "generated", bytes: 5 }] }], "dependencies")).toBe(10);
  });
  test("reports unavailable integration refs", () => {
    expect(mergeState(process.cwd(), "HEAD", "refs/does-not-exist")).toBe("unavailable");
  });
});

describe("retirement policy", () => {
  const primary = "/repo";
  test("allows clean merged and dirty attached worktrees", () => {
    expect(planRetirement(primary, true, "/worktree", { statusAvailable: true, dirty: false, mergeState: "merged", branch: "done" })).toBe("clean-merged");
    expect(planRetirement(primary, true, "/worktree", { statusAvailable: true, dirty: true, mergeState: "unmerged", branch: "experiment" })).toBe("archive-required");
  });
  test("refuses primary, unknown, clean unmerged, and dirty detached worktrees", () => {
    expect(() => planRetirement(primary, true, primary, {})).toThrow(/primary/);
    expect(() => planRetirement(primary, false, "/missing", {})).toThrow(/unknown/);
    expect(() => planRetirement(primary, true, "/worktree", { statusAvailable: true, dirty: false, mergeState: "unmerged", branch: "open" })).toThrow(/not merged/);
    expect(() => planRetirement(primary, true, "/worktree", { statusAvailable: true, dirty: true, mergeState: "unmerged", branch: null })).toThrow(/detached/);
  });
  test("rejects archive path traversal", () => expect(() => assertInside("/safe/archive", "/safe/other")).toThrow(/escapes archive root/));

  test("archives dirty work, verifies its bundle, and removes only the worktree", () => {
    const root = mkdtempSync(resolve(tmpdir(), "transport-hygiene-"));
    const remote = resolve(root, "remote.git");
    const repo = resolve(root, "repo");
    const worktree = resolve(root, "experiment");
    const archive = resolve(root, "archive");
    try {
      git(root, "init", "--bare", remote);
      git(root, "init", "-b", "main", repo);
      git(repo, "config", "user.name", "Hygiene Test");
      git(repo, "config", "user.email", "hygiene@example.test");
      git(repo, "config", "commit.gpgsign", "false");
      writeFileSync(resolve(repo, "tracked.txt"), "baseline\n");
      git(repo, "add", "tracked.txt");
      git(repo, "commit", "-m", "baseline");
      git(repo, "remote", "add", "origin", remote);
      git(repo, "push", "-u", "origin", "main");
      git(repo, "worktree", "add", "-b", "experiment", worktree);
      writeFileSync(resolve(worktree, "unique.txt"), "unique commit\n");
      git(worktree, "add", "unique.txt");
      git(worktree, "commit", "-m", "unique experiment");
      writeFileSync(resolve(worktree, "tracked.txt"), "dirty\n");
      writeFileSync(resolve(worktree, "untracked.txt"), "preserve me\n");
      const result = spawnSync(process.execPath, [resolve(scriptsDir, "worktree-retire.mjs"), "--execute", "--archive-dir", archive, "--worktree", worktree], { cwd: repo, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(worktree)).toBe(false);
      expect(git(repo, "worktree", "list")).not.toContain(worktree);
      const archived = resolve(archive, readdirSync(archive)[0]);
      expect(existsSync(resolve(archived, "unstaged.patch"))).toBe(true);
      expect(existsSync(resolve(archived, "untracked", "untracked.txt"))).toBe(true);
      expect(() => git(repo, "bundle", "verify", resolve(archived, "commits.bundle"))).not.toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("routes Cargo output outside the checkout", () => {
    const root = mkdtempSync(resolve(tmpdir(), "transport-cargo-route-"));
    const fakeCargo = resolve(root, "cargo");
    const externalTarget = resolve(root, "external-target");
    writeFileSync(fakeCargo, "#!/bin/sh\nmkdir -p \"$CARGO_TARGET_DIR\"\ntouch \"$CARGO_TARGET_DIR/routed\"\n");
    chmodSync(fakeCargo, 0o755);
    try {
      const result = spawnSync(process.execPath, [resolve(scriptsDir, "cargo-target.mjs"), "test", fakeCargo, "check"], { cwd: root, env: { ...process.env, TRANSPORT_CARGO_TARGET_TEST: externalTarget }, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(resolve(externalTarget, "routed"))).toBe(true);
      expect(existsSync(resolve(root, "target"))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
