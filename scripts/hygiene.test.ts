import { describe, expect, test } from "vitest";
import { assertInside, formatBytes, mergeState, parseWorktreePorcelain, planRetirement, sumCategory } from "./hygiene-lib.mjs";

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
});
