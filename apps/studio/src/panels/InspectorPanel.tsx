import type { ReactNode } from "react";
import type { Diagnostic, Project, SceneEntity, TrackSample } from "@transport/domain";

interface InspectorPanelProps {
  readonly entity?: SceneEntity;
  readonly diagnostics: readonly Diagnostic[];
  readonly tracks: readonly TrackSample[];
  readonly project: Project;
}

export function InspectorPanel({ entity, diagnostics, tracks, project }: InspectorPanelProps) {
  const entityDiagnostics = entity ? diagnostics.filter((diagnostic) => diagnostic.entityId === entity.id) : [];

  return (
    <section className="panel inspector-panel">
      <div className="panel-header">
        <div>
          <h2>Inspector</h2>
          <p className="muted compact">selected entity + transport hints</p>
        </div>
      </div>

      {!entity ? (
        <EmptyInspector project={project} tracks={tracks} />
      ) : (
        <>
          <div className="entity-title-card">
            <div className={`large-entity-icon kind-${entity.kind.replace("-", "")}`}>{iconFor(entity)}</div>
            <div>
              <h3>{entity.name}</h3>
              <p>{entity.kind}</p>
            </div>
          </div>

          <PropertySection title="Transform">
            <Property label="Position" value={formatVec(getTransformVec(entity, "position"))} />
            <Property label="Rotation" value={formatVec(getTransformVec(entity, "rotationEuler"))} />
            <Property label="Scale" value={formatVec(getTransformVec(entity, "scale"))} />
          </PropertySection>

          <PropertySection title="Entity details">
            {renderEntitySpecificProperties(entity)}
          </PropertySection>

          <PropertySection title="Tags">
            <div className="tag-row">{entity.tags.length ? entity.tags.map((tag) => <span key={tag} className="tag">{tag}</span>) : <span className="muted">none</span>}</div>
          </PropertySection>

          <PropertySection title="Diagnostics">
            {entityDiagnostics.length === 0 ? (
              <p className="muted">No entity-specific diagnostics.</p>
            ) : (
              entityDiagnostics.map((diagnostic, index) => (
                <p key={index} className={`diagnostic-card ${diagnostic.severity}`}>{diagnostic.message}</p>
              ))
            )}
          </PropertySection>
        </>
      )}
    </section>
  );
}

function EmptyInspector({ project, tracks }: { readonly project: Project; readonly tracks: readonly TrackSample[] }) {
  return (
    <div className="empty-state">
      <div className="empty-orb">✦</div>
      <h3>Select something in the scene</h3>
      <p>Click geometry, sources, tallies, or project-tree entries to inspect their transport-facing properties.</p>
      <div className="mini-summary">
        <span>{project.scene.entities.length} entities</span>
        <span>{tracks.length} sampled histories</span>
      </div>
    </div>
  );
}

function PropertySection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <section className="property-section"><h3>{title}</h3>{children}</section>;
}

function Property({ label, value }: { readonly label: string; readonly value: string | number }) {
  return <div className="property-row"><span>{label}</span><strong>{value}</strong></div>;
}

type Vec3Like = Partial<{ readonly x: number; readonly y: number; readonly z: number }> | undefined | null;

function getTransformVec(
  entity: SceneEntity,
  key: keyof SceneEntity["transform"],
): Vec3Like {
  return entity.transform?.[key];
}

function renderEntitySpecificProperties(entity: SceneEntity) {
  switch (entity.kind) {
    case "geometry":
      return <><Property label="Primitive" value={entity.primitive} /><Property label="Material" value={entity.materialId ?? "unassigned"} /></>;
    case "material":
      return <><Property label="Color" value={entity.color} /><Property label="Attenuation" value={entity.attenuationCoefficient} /><Property label="Scatter" value={`${Math.round(entity.scatterProbability * 100)}%`} /><Property label="Absorb" value={`${Math.round(entity.absorptionProbability * 100)}%`} /></>;
    case "source":
      return <><Property label="Source" value={entity.sourceKind} /><Property label="Particle" value={entity.particleType} /><Property label="Energy" value={`${entity.energy} MeV`} /><Property label="Strength" value={entity.strength} /></>;
    case "tally":
      return <><Property label="Tally" value={entity.tallyKind} /><Property label="Particles" value={entity.particleTypes.join(", ")} /><Property label="Bins" value={entity.bins?.join(" × ") ?? "continuous"} /></>;
  }
}

function iconFor(entity: SceneEntity) {
  switch (entity.kind) {
    case "geometry": return "◇";
    case "material": return "●";
    case "source": return "↦";
    case "tally": return "▦";
  }
}



function formatVec(vec: Vec3Like) {
  if (!vec) {
    return "not set";
  }

  const x = formatNumber(vec.x);
  const y = formatNumber(vec.y);
  const z = formatNumber(vec.z);

  return `${x}, ${y}, ${z}`;
}

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}
