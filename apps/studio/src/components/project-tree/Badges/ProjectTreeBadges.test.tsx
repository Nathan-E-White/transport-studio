import {render, screen} from "@testing-library/react";
import {ReactNode} from "react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {EditorStoreProvider, ProjectTreeNode} from "../../../state/editor";
import {ProjectTreeBadges} from "./ProjectTreeBadges";
import {ProjectTreeBadgesScope} from "./ProjectTreeBadgesScope";

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

function renderWithEditorStore(ui: ReactNode) {
    return render(<EditorStoreProvider>{ui}</EditorStoreProvider>);
}

function BrokenBadgeSubtree(): never {
    throw new Error("synthetic badge subtree failure");
}

describe("ProjectTreeBadges", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it("renders nothing when the node has no badges", () => {
        const {container} = renderWithEditorStore(
            <ProjectTreeBadgesScope>
                <ProjectTreeBadges node={geometryNode}/>
            </ProjectTreeBadgesScope>,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("requires the project tree badges scope", () => {
        expect(() => {
            renderWithEditorStore(<ProjectTreeBadges node={geometryNode}/>);
        }).toThrow("useProjectTreeBadges must be used inside ProjectTreeBadgesProvider");
    });

    it("uses the scope boundary fallback when the badge subtree crashes", () => {
        renderWithEditorStore(
            <ProjectTreeBadgesScope>
                <BrokenBadgeSubtree/>
            </ProjectTreeBadgesScope>,
        );

        expect(screen.getByText("badges unavailable")).toBeInTheDocument();
        expect(screen.getByTitle("synthetic badge subtree failure")).toBeInTheDocument();
    });
});
