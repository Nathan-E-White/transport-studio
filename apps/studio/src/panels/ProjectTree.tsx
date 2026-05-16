import type { Project } from "@transport/domain";

interface ProjectTreeProps {
  readonly project: Project;
  readonly selectedEntityId?: string;
  readonly onSelect: (entityId: string) => void;
}

export function ProjectTree({ project, selectedEntityId, onSelect }: ProjectTreeProps) {
  const groups = ["geometry", "material", "source", "tally"] as const;

  return (
    <section className="panel">
      <h2>{project.name}</h2>
      {groups.map((kind) => (
        <div className="tree-group" key={kind}>
          <h3>{kind}</h3>
          {project.scene.entities
            .filter((entity) => entity.kind === kind)
            .map((entity) => (
              <button
                className={entity.id === selectedEntityId ? "tree-item selected" : "tree-item"}
                key={entity.id}
                onClick={() => onSelect(entity.id)}
              >
                {entity.name}
              </button>
            ))}
        </div>
      ))}
    </section>
  );
}
