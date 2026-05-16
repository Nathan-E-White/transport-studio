import type { EntityKind, Project, SceneEntity } from "@transport/domain";

interface ProjectTreeProps {
  readonly project: Project;
  readonly selectedEntityId?: string;
  readonly onSelect: (entityId: string) => void;
  readonly stats: { geometry: number; materials: number; sources: number; tallies: number };
}

const groups: readonly { kind: SceneEntity["kind"]; label: string; icon: string }[] = [
  { kind: "geometry", label: "Geometry", icon: "◇" },
  { kind: "material", label: "Materials", icon: "●" },
  { kind: "source", label: "Sources", icon: "↦" },
  { kind: "tally", label: "Tallies", icon: "▦" }
];

export function ProjectTree({ project, selectedEntityId, onSelect, stats }: ProjectTreeProps) {
  return (
    <section className="panel project-panel">
      <div className="panel-header">
        <div>
          <h2>{project.name}</h2>
          <p className="muted compact">{project.metadata.physicsModelVersion}</p>
        </div>
        <button className="icon-button" title="Project settings">⚙</button>
      </div>

      <div className="stat-grid">
        <Stat label="geom" value={stats.geometry} />
        <Stat label="mat" value={stats.materials} />
        <Stat label="src" value={stats.sources} />
        <Stat label="tally" value={stats.tallies} />
      </div>

      <div className="asset-search">Search entities…</div>

      {groups.map((group) => {
        const entities = project.scene.entities.filter((entity) => entity.kind === group.kind);
        return (
          <div className="tree-group" key={group.kind}>
            <h3><span>{group.icon}</span>{group.label}<em>{entities.length}</em></h3>
            {entities.map((entity) => (
              <button
                className={entity.id === selectedEntityId ? "tree-item selected" : "tree-item"}
                key={entity.id}
                onClick={() => onSelect(entity.id)}
              >
                <span className={`entity-dot ${kindClass(entity.kind)}`} />
                <span className="tree-item-main">
                  <strong>{entity.name}</strong>
                  <small>{describeEntity(entity)}</small>
                </span>
                <span className="tree-visibility">{entity.visible ? "◉" : "○"}</span>
              </button>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: number }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function kindClass(kind: EntityKind) {
  return `kind-${kind.replace("-", "")}`;
}

function describeEntity(entity: SceneEntity) {
  switch (entity.kind) {
    case "geometry": return `${entity.primitive} · ${entity.materialId ? "material assigned" : "no material"}`;
    case "material": return `μ=${entity.attenuationCoefficient.toFixed(2)} · scatter ${Math.round(entity.scatterProbability * 100)}%`;
    case "source": return `${entity.sourceKind} · ${entity.particleType} · ${entity.energy} MeV`;
    case "tally": return `${entity.tallyKind} · ${entity.particleTypes.join(", ")}`;
  }
}
