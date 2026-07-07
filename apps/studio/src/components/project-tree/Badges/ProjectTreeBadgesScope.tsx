import {PropsWithChildren} from "react";
import {ProjectTreeBadgesBoundary} from "./ProjectTreeBadgesBoundary";
import {ProjectTreeBadgesProvider} from "./ProjectTreeBadgesProvider";

// noinspection JSUnusedGlobalSymbols
export function ProjectTreeBadgesScope({children}: Readonly<PropsWithChildren>) {
    return (
        <ProjectTreeBadgesBoundary>
            <ProjectTreeBadgesProvider>{children}</ProjectTreeBadgesProvider>
        </ProjectTreeBadgesBoundary>
    );
}