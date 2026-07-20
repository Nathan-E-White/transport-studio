import type {Diagnostic} from "@transport/domain";

export const EDITOR_RENDER_FAILURE_CLASSIFICATION = "editor.ui.render-failure";

export type EditorFailureSurface = "editor-state" | "project-tree";
export type EditorFailureRecoverability = "retryable";

export interface EditorFailureCapture {
  readonly surface: EditorFailureSurface;
  readonly recoverability: EditorFailureRecoverability;
  readonly error: unknown;
  readonly componentStack?: string | null;
}

export interface EditorFailureConsoleEntry {
  readonly id: number;
  readonly classification: typeof EDITOR_RENDER_FAILURE_CLASSIFICATION;
  readonly surface: EditorFailureSurface;
  readonly recoverability: EditorFailureRecoverability;
  readonly observedAt: string;
  readonly occurrences: number;
  readonly errorName: string;
  readonly message: string;
  readonly componentPath: readonly string[];
}

export interface EditorFailureSnapshot {
  readonly capacity: number;
  readonly droppedCount: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly consoleEntries: readonly EditorFailureConsoleEntry[];
}

export interface EditorFailureJournal {
  capture(failure: EditorFailureCapture): EditorFailureConsoleEntry;
  getSnapshot(): EditorFailureSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface EditorFailureJournalOptions {
  readonly capacity?: number;
  readonly now?: () => string;
}

const DEFAULT_CAPACITY = 20;

export function createEditorFailureJournal(
  options: EditorFailureJournalOptions = {},
): EditorFailureJournal {
  const capacity = Math.max(1, Math.floor(options.capacity ?? DEFAULT_CAPACITY));
  const now = options.now ?? (() => new Date().toISOString());
  const listeners = new Set<() => void>();
  let nextId = 1;
  let snapshot: EditorFailureSnapshot = {
    capacity,
    droppedCount: 0,
    diagnostics: [],
    consoleEntries: [],
  };

  return {
    capture(failure) {
      const error = normalizeError(failure.error);
      const candidate: EditorFailureConsoleEntry = {
        id: nextId,
        classification: EDITOR_RENDER_FAILURE_CLASSIFICATION,
        surface: failure.surface,
        recoverability: failure.recoverability,
        observedAt: now(),
        occurrences: 1,
        errorName: error.name,
        message: error.message,
        componentPath: componentPath(failure.componentStack),
      };
      const duplicateIndex = snapshot.consoleEntries.findIndex((entry) => sameFailure(entry, candidate));
      const entries = duplicateIndex >= 0
        ? snapshot.consoleEntries.map((entry, index) => index === duplicateIndex
          ? {...entry, observedAt: candidate.observedAt, occurrences: entry.occurrences + 1}
          : entry)
        : [...snapshot.consoleEntries, {...candidate, id: nextId++}];
      const droppedCount = snapshot.droppedCount + Math.max(0, entries.length - capacity);
      const retainedEntries = entries.slice(-capacity);
      snapshot = {
        ...snapshot,
        droppedCount,
        diagnostics: retainedEntries.map(toDiagnostic),
        consoleEntries: retainedEntries,
      };
      listeners.forEach((listener) => {
        try {
          listener();
        } catch {
          // Reporting must remain fail-closed so a broken observer cannot trigger another boundary capture.
        }
      });
      return retainedEntries.find((entry) => sameFailure(entry, candidate))!;
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function captureEditorBoundaryFailure(
  journal: EditorFailureJournal,
  failure: Omit<EditorFailureCapture, "recoverability">,
  notify?: () => void,
): EditorFailureConsoleEntry {
  const entry = journal.capture({...failure, recoverability: "retryable"});
  try {
    notify?.();
  } catch {
    // A diagnostic observer is not allowed to turn reporting into another render failure.
  }
  try {
    console.error(`${entry.classification}: ${entry.surface} (${entry.recoverability})`);
  } catch {
    // Browser logging is best-effort; the retained application record is authoritative.
  }
  return entry;
}

function sameFailure(left: EditorFailureConsoleEntry, right: EditorFailureConsoleEntry): boolean {
  return left.classification === right.classification
    && left.surface === right.surface
    && left.recoverability === right.recoverability
    && left.errorName === right.errorName
    && left.message === right.message
    && left.componentPath.join("\n") === right.componentPath.join("\n");
}

function normalizeError(error: unknown): {readonly name: string; readonly message: string} {
  if (error instanceof Error) {
    return {
      name: sanitizeContext(error.name || "Error"),
      message: sanitizeContext(error.message || "Unknown editor failure."),
    };
  }
  return {
    name: "NonErrorThrown",
    message: sanitizeContext(typeof error === "string" ? error : "Unknown editor failure."),
  };
}

function sanitizeContext(value: string): string {
  return value
    .replace(
      /\b(token|password|secret|api[-_]?key|access[-_]?token|authorization)\b(\s*[:=]\s*)(?:Bearer\s+)?[^\s&,;]+/gi,
      (_match, key: string, separator: string) => `${key}${separator}[REDACTED]`,
    )
    .replace(/\b([a-z][\w+.-]*:\/\/[^:\s/]+:)[^@\s/]+@/gi, "$1[REDACTED]@")
    .replace(/\/(?:Users|home)\/[^\s)]+/g, "[LOCAL_PATH]")
    .replace(/[A-Za-z]:\\Users\\[^\s)]+/g, "[LOCAL_PATH]")
    .slice(0, 500);
}

function componentPath(stack: string | null | undefined): readonly string[] {
  if (!stack) return [];
  return stack.split("\n").flatMap((line) => {
    const match = line.match(/^\s*at\s+([^\s(]+)/);
    return match?.[1] ? [match[1]] : [];
  });
}

function toDiagnostic(entry: EditorFailureConsoleEntry): Diagnostic {
  return {
    severity: "error",
    code: entry.classification,
    message: `${surfaceLabel(entry.surface)} render failure (${entry.recoverability}): ${entry.message}`,
  };
}

function surfaceLabel(surface: EditorFailureSurface): string {
  return surface === "project-tree" ? "Project tree" : "Editor state";
}
