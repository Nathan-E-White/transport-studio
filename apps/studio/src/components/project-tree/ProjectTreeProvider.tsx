import {PropsWithChildren, createContext, useContext, useMemo} from "react";
import type {SceneEntity} from "@transport/domain";
import type {EditorEntityRef} from "../../state/editor";

export interface ProjectTreeContextValue {
  readonly selectedEntityId?: string;
  readonly editingEntityId?: string;
  readonly onSelect: (ref: EditorEntityRef) => void;
  readonly onRequestEdit: (ref: EditorEntityRef) => void;
  readonly onDuplicate: (ref: EditorEntityRef) => void;
  readonly onDelete: (ref: EditorEntityRef) => void;
  readonly onVisibleChange: (ref: EditorEntityRef, visible: boolean) => void;
  readonly onLockedChange: (ref: EditorEntityRef, locked: boolean) => void;
  readonly onCompileInclusionChange: (ref: EditorEntityRef, included: boolean) => void;
  readonly onCreateEntity: (kind: SceneEntity["kind"]) => void;
  readonly allowDelete: boolean;
}

export interface ProjectTreeProviderProps extends PropsWithChildren, ProjectTreeContextValue {}

const ProjectTreeContext = createContext<ProjectTreeContextValue | null>(null);

export function ProjectTreeProvider({
  selectedEntityId,
  editingEntityId,
  onSelect,
  onRequestEdit,
  onDuplicate,
  onDelete,
  onVisibleChange,
  onLockedChange,
  onCompileInclusionChange,
  onCreateEntity,
  allowDelete,
  children,
}: Readonly<ProjectTreeProviderProps>) {
  const value = useMemo<ProjectTreeContextValue>(
    () => ({
      selectedEntityId,
      editingEntityId,
      onSelect,
      onRequestEdit,
      onDuplicate,
      onDelete,
      onVisibleChange,
      onLockedChange,
      onCompileInclusionChange,
      onCreateEntity,
      allowDelete,
    }),
    [
      allowDelete,
      editingEntityId,
      onCompileInclusionChange,
      onCreateEntity,
      onDelete,
      onDuplicate,
      onLockedChange,
      onRequestEdit,
      onSelect,
      onVisibleChange,
      selectedEntityId,
    ],
  );

  return <ProjectTreeContext.Provider value={value}>{children}</ProjectTreeContext.Provider>;
}

export function useProjectTree(): ProjectTreeContextValue {
  const value = useContext(ProjectTreeContext);

  if (!value) {
    throw new Error("useProjectTree must be used inside ProjectTreeProvider");
  }

  return value;
}
