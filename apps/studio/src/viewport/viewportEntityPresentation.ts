import type {SceneEntity} from "@transport/domain";
import {getEntityViewFlags, type VisibilityTable} from "../state/editor";

export interface ViewportEntityPresentation {
  readonly visible: boolean;
  readonly selectable: boolean;
  readonly locked: boolean;
  readonly helperOnly: boolean;
}

export function getViewportEntityPresentation(
  entity: SceneEntity,
  visibility: VisibilityTable,
): ViewportEntityPresentation {
  const flags = getEntityViewFlags(visibility, {kind: entity.kind, id: entity.id});
  return {
    visible: entity.visible && flags.visible,
    selectable: flags.selectable,
    locked: flags.locked,
    helperOnly: flags.helperOnly,
  };
}

export function pickViewportEntity(
  entity: SceneEntity,
  presentation: ViewportEntityPresentation,
  onSelect: (entityId: string) => void,
): boolean {
  if (!presentation.visible || !presentation.selectable) return false;
  onSelect(entity.id);
  return true;
}
