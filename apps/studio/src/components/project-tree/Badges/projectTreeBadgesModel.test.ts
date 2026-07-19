// apps/studio/src/components/project-tree/projectTreeBadgesModel.test.ts

import { describe, expect, it } from "vitest";
import { getProjectTreeBadges } from "./projectTreeBadgesModel";
import { ProjectTreeNode } from "../../../state/editor";

const geometryNode: ProjectTreeNode = {
    id: "entity:geometry:g1",
    label: "Fuel pin",
    kind: "entity",
    entityKind: "geometry",
    entityRef: {
        kind: "geometry",
        id: "g1",
    },
};

describe("getProjectTreeBadges", () => {
    it("returns no badges for a healthy visible included entity", () => {
        const badges = getProjectTreeBadges({
            node: geometryNode,
            visibility: {},
            validationDiagnostics: [],
            staleReasons: [],
        });

        expect(badges).toEqual([]);
    });

    it("returns invalid badge for entity-specific validation errors", () => {
        const badges = getProjectTreeBadges({
            node: geometryNode,
            visibility: {},
            validationDiagnostics: [
                {
                    id: "e1",
                    severity: "error",
                    message: "Geometry is invalid.",
                    entity: {
                        kind: "geometry",
                        id: "g1",
                    },
                },
            ],
            staleReasons: [],
        });

        expect(badges.map((badge) => badge.kind)).toContain("invalid");
    });

    it("returns missing-material badge for geometry diagnostic code", () => {
        const badges = getProjectTreeBadges({
            node: geometryNode,
            visibility: {},
            validationDiagnostics: [
                {
                    id: "w1",
                    severity: "warning",
                    code: "missing-material",
                    message: "Missing material assignment.",
                    entity: {
                        kind: "geometry",
                        id: "g1",
                    },
                },
            ],
            staleReasons: [],
        });

        expect(badges.map((badge) => badge.kind)).toEqual([
            "warning",
            "missing-material",
        ]);
    });

    it("returns hidden locked and excluded badges from visibility flags", () => {
        const badges = getProjectTreeBadges({
            node: geometryNode,
            visibility: {
                "geometry:g1": {
                    visible: false,
                    selectable: true,
                    locked: true,
                    includedInCompile: false,
                    helperOnly: false,
                },
            },
            validationDiagnostics: [],
            staleReasons: [],
        });

        expect(badges.map((badge) => badge.kind)).toEqual([
            "hidden",
            "locked",
            "excluded",
        ]);
    });

    it("returns stale badge for geometry when geometry changed", () => {
        const badges = getProjectTreeBadges({
            node: geometryNode,
            visibility: {},
            validationDiagnostics: [],
            staleReasons: ["geometry-changed"],
        });

        expect(badges.map((badge) => badge.kind)).toContain("stale");
    });
});
