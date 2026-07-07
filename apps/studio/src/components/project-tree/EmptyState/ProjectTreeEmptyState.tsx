export interface ProjectTreeEmptyStateProps {
  readonly searchQuery?: string;
}

export function ProjectTreeEmptyState({searchQuery}: Readonly<ProjectTreeEmptyStateProps>) {
  const hasSearch = !!searchQuery?.trim();

  return (
    <div className="project-tree__empty" role="status">
      {hasSearch ? "No matching entities." : "No project entities yet."}
    </div>
  );
}
