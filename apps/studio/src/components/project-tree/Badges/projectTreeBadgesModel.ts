// apps/studio/src/components/project-tree/projectTreeBadgesModel.ts
import {
    EditorDiagnostic,
    EditorEntityRef,
    ProjectTreeNode,
    VisibilityTable,
    entityKey,
    getEntityViewFlags,
} from "../../../state/editor";

export type ProjectTreeBadgeKind =
    | "invalid"
    | "warning"
    | "stale"
    | "helper-only"
    | "missing-material"
    | "unassigned-region"
    | "hidden"
    | "locked"
    | "excluded";

export interface ProjectTreeBadge {
    readonly kind: ProjectTreeBadgeKind;
    readonly label: string;
    readonly title: string;
    readonly severity: "error" | "warning" | "info";
}

export interface ProjectTreeBadgeInput {
    readonly node: ProjectTreeNode;
    readonly visibility: VisibilityTable;
    readonly validationErrors: readonly EditorDiagnostic[];
    readonly validationWarnings: readonly EditorDiagnostic[];
    readonly staleReasons: readonly string[];
}

export function getProjectTreeBadges(input: ProjectTreeBadgeInput): readonly ProjectTreeBadge[] {
    const { node, visibility, validationErrors, validationWarnings, staleReasons } = input;

    if (!node.entityRef) {
        return [];
    }

    const ref = node.entityRef;
    const flags = getEntityViewFlags(visibility, ref);

    const entityErrors = validationErrors.filter((diagnostic) =>
        diagnostic.entity ? entityKey(diagnostic.entity) === entityKey(ref) : false,
    );

    const entityWarnings = validationWarnings.filter((diagnostic) =>
        diagnostic.entity ? entityKey(diagnostic.entity) === entityKey(ref) : false,
    );

    const badges: ProjectTreeBadge[] = [];

    if (entityErrors.length > 0) {
        badges.push({
            kind: "invalid",
            label: "invalid",
            title: summarizeDiagnostics(entityErrors, "Invalid entity"),
            severity: "error",
        });
    }

    if (entityWarnings.length > 0) {
        badges.push({
            kind: "warning",
            label: "warning",
            title: summarizeDiagnostics(entityWarnings, "Entity has warnings"),
            severity: "warning",
        });
    }

    if (isEntityStale(staleReasons, ref)) {
        badges.push({
            kind: "stale",
            label: "stale",
            title: "Derived validation, compiled problem, or run results may be stale for this entity.",
            severity: "info",
        });
    }

    if (flags.helperOnly) {
        badges.push({
            kind: "helper-only",
            label: "helper",
            title: "This entity is an editor helper and will not be emitted into the compiled transport problem.",
            severity: "info",
        });
    }

    if (ref.kind === "geometry" && hasDiagnosticCode(entityErrors, entityWarnings, "missing-material")) {
        badges.push({
            kind: "missing-material",
            label: "material?",
            title: "This geometry appears to be missing a material assignment.",
            severity: "warning",
        });
    }

    if (ref.kind === "region" && hasDiagnosticCode(entityErrors, entityWarnings, "unassigned-region")) {
        badges.push({
            kind: "unassigned-region",
            label: "unassigned",
            title: "This region appears to be unassigned or disconnected from the compiled problem.",
            severity: "warning",
        });
    }

    if (!flags.visible) {
        badges.push({
            kind: "hidden",
            label: "hidden",
            title: "This entity is hidden in the viewport.",
            severity: "info",
        });
    }

    if (flags.locked) {
        badges.push({
            kind: "locked",
            label: "locked",
            title: "This entity is locked against editing.",
            severity: "info",
        });
    }

    if (!flags.includedInCompile) {
        badges.push({
            kind: "excluded",
            label: "excluded",
            title: "This entity is excluded from the compiled transport problem.",
            severity: "info",
        });
    }

    return dedupeBadges(badges);
}

export function getProjectTreeBadgeClassName(badge: ProjectTreeBadge): string {
    return [
        "project-tree-badge",
        `project-tree-badge--${badge.severity}`,
        `project-tree-badge--${badge.kind}`,
    ].join(" ");
}

export function summarizeDiagnostics(
    diagnostics: readonly EditorDiagnostic[],
    fallback: string,
): string {
    if (diagnostics.length === 0) {
        return fallback;
    }

    if (diagnostics.length === 1) {
        return diagnostics[0]?.message ?? fallback;
    }

    return `${diagnostics.length} diagnostics: ${diagnostics
        .slice(0, 3)
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`;
}

export function hasDiagnosticCode(
    errors: readonly EditorDiagnostic[],
    warnings: readonly EditorDiagnostic[],
    code: string,
): boolean {
    return [...errors, ...warnings].some((diagnostic) => diagnostic.code === code);
}

export function isEntityStale(reasons: readonly string[], ref: EditorEntityRef): boolean {
    if (reasons.length === 0) {
        return false;
    }

    switch (ref.kind) {
        case "geometry":
        case "region":
        case "surface":
        case "transform":
            return reasons.includes("geometry-changed");

        case "material":
            return reasons.includes("material-changed");

        case "source":
            return reasons.includes("source-changed");

        case "tally":
            return reasons.includes("tally-changed");

        default:
            return reasons.includes("unknown");
    }
}

export function dedupeBadges(badges: readonly ProjectTreeBadge[]): readonly ProjectTreeBadge[] {
    const seen = new Set<ProjectTreeBadgeKind>();
    const out: ProjectTreeBadge[] = [];

    for (const badge of badges) {
        if (seen.has(badge.kind)) {
            continue;
        }

        seen.add(badge.kind);
        out.push(badge);
    }

    return out;
}