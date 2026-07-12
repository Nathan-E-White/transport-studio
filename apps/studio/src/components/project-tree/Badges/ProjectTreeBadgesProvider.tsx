import {createContext, PropsWithChildren, useContext, useMemo} from "react";

import {
    dedupeBadges,
    hasDiagnosticCode,
    isEntityStale,
    type ProjectTreeBadge,
    summarizeDiagnostics
} from "./projectTreeBadgesModel";

import {EditorDiagnostic, entityKey, getEntityViewFlags, ProjectTreeNode, selectVisibility, useEditorStore,} from "../../../state/editor";


export interface ProjectTreeBadgesContextValue {
    readonly getBadgesForNode: (node: ProjectTreeNode) => readonly ProjectTreeBadge[];
}

const ProjectTreeBadgesContext = createContext<ProjectTreeBadgesContextValue | null>(null);

export function ProjectTreeBadgesProvider({children}: Readonly<PropsWithChildren>) {
    const {state} = useEditorStore();
    const visibility = useMemo(() => selectVisibility(state), [state.scene.project]);

    const value = useMemo<ProjectTreeBadgesContextValue>(() => {
        const errorsByEntity = groupDiagnosticsByEntity(state.validation.errors);
        const warningsByEntity = groupDiagnosticsByEntity(state.validation.warnings);

        return {
            getBadgesForNode(node: ProjectTreeNode): readonly ProjectTreeBadge[] {
                if (!node.entityRef) {
                    return [];
                }

                const ref = node.entityRef;
                const key = entityKey(ref);
                const flags = getEntityViewFlags(visibility, ref);
                const entityErrors = errorsByEntity.get(key) ?? [];
                const entityWarnings = warningsByEntity.get(key) ?? [];
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

                if (isEntityStale(state.stale.reasons, ref)) {
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
            },
        };
    }, [state.stale.reasons, state.validation.errors, state.validation.warnings, visibility]);

    return (
        <ProjectTreeBadgesContext.Provider value={value}>
            {children}
        </ProjectTreeBadgesContext.Provider>
    );
}

export function useProjectTreeBadges(): ProjectTreeBadgesContextValue {
    const value = useContext(ProjectTreeBadgesContext);

    if (!value) {
        throw new Error("useProjectTreeBadges must be used inside ProjectTreeBadgesProvider");
    }

    return value;
}

function groupDiagnosticsByEntity(
    diagnostics: readonly EditorDiagnostic[],
): Map<string, readonly EditorDiagnostic[]> {
    const grouped = new Map<string, EditorDiagnostic[]>();

    for (const diagnostic of diagnostics) {
        if (!diagnostic.entity) {
            continue;
        }

        const key = entityKey(diagnostic.entity);
        const current = grouped.get(key) ?? [];
        current.push(diagnostic);
        grouped.set(key, current);
    }

    return grouped;
}

