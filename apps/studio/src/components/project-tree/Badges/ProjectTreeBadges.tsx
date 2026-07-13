import {ProjectTreeNode} from "../../../state/editor";
import {selectVisibility, useEditorStore} from "../../../state/editor";
import {getProjectTreeBadgeClassName, getProjectTreeBadges} from "./projectTreeBadgesModel";

export interface ProjectTreeBadgesProps {
    readonly node: ProjectTreeNode;
}

export function ProjectTreeBadges({node}: ProjectTreeBadgesProps) {
    const {state} = useEditorStore();
    const badges = getProjectTreeBadges({
        node,
        visibility: selectVisibility(state),
        validationErrors: state.validation.errors,
        validationWarnings: state.validation.warnings,
        staleReasons: state.stale.reasons,
    });

    if (badges.length === 0) {
        return null;
    }

    return (
        <span className="project-tree-badges" aria-label="Project tree badges">
      {badges.map((badge) => (
          <span
              key={badge.kind}
              className={getProjectTreeBadgeClassName(badge)}
              title={badge.title}
              data-badge-kind={badge.kind}
              data-badge-severity={badge.severity}
          >
          {badge.label}
        </span>
      ))}
    </span>
    );
}
