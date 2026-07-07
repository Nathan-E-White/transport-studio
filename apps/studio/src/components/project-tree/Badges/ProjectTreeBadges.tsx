import {ProjectTreeNode} from "../../../state/editor";
import {useProjectTreeBadges} from "./ProjectTreeBadgesProvider";
import {getProjectTreeBadgeClassName} from "./projectTreeBadgesModel";

export interface ProjectTreeBadgesProps {
    readonly node: ProjectTreeNode;
}

export function ProjectTreeBadges({node}: ProjectTreeBadgesProps) {
    const {getBadgesForNode} = useProjectTreeBadges();
    const badges = getBadgesForNode(node);

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