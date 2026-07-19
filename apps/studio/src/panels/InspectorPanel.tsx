import {useEffect, useRef, useState, type ReactNode} from "react";
import type { Diagnostic, Project, SceneEntity, TrackSample } from "@transport/domain";
import {commitInspectorCandidate, type InspectorEditDiagnostic} from "../app/inspectorEditing";

interface InspectorPanelProps {
  readonly entity?: SceneEntity;
  readonly diagnostics: readonly Diagnostic[];
  readonly tracks: readonly TrackSample[];
  readonly project: Project;
  readonly onEntityChange?: (baseline: SceneEntity, candidate: SceneEntity) => void;
  readonly editDiagnostics?: readonly InspectorEditDiagnostic[];
  readonly editingDisabledReason?: string;
}

export function InspectorPanel({ entity, diagnostics, tracks, project, onEntityChange, editDiagnostics = [], editingDisabledReason }: InspectorPanelProps) {
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

          <InspectorEditor key={entity.id} entity={entity} project={project} onEntityChange={onEntityChange}
            externalDiagnostics={editDiagnostics} editingDisabledReason={editingDisabledReason}/>

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

function InspectorEditor({entity, project, onEntityChange, externalDiagnostics, editingDisabledReason}: {
  readonly entity: SceneEntity;
  readonly project: Project;
  readonly onEntityChange?: (baseline: SceneEntity, candidate: SceneEntity) => void;
  readonly externalDiagnostics: readonly InspectorEditDiagnostic[];
  readonly editingDisabledReason?: string;
}) {
  const [baseline, setBaseline] = useState<SceneEntity>(() => structuredClone(entity));
  const [candidate, setCandidate] = useState<SceneEntity>(() => structuredClone(entity));
  const [editDiagnostics, setEditDiagnostics] = useState<readonly InspectorEditDiagnostic[]>([]);
  const handledExternalDiagnostics = useRef(editDiagnostics);

  useEffect(() => {
    if (externalDiagnostics.length === 0 || handledExternalDiagnostics.current === externalDiagnostics) return;
    handledExternalDiagnostics.current = externalDiagnostics;
    setBaseline(structuredClone(entity));
    setCandidate(structuredClone(entity));
    setEditDiagnostics([]);
  }, [entity, externalDiagnostics]);

  function save() {
    const result = commitInspectorCandidate(project, candidate);
    if (!result.ok) {
      setEditDiagnostics(result.diagnostics);
      return;
    }
    setEditDiagnostics([]);
    onEntityChange?.(baseline, candidate);
    setBaseline(structuredClone(candidate));
  }

  return (
    <form className="inspector-edit-form" onSubmit={(event) => {event.preventDefault(); save();}}>
      {entity.locked && <p className="diagnostic-card warning" role="status">This entity is locked. Unlock it in the Project Tree before editing.</p>}
      {editingDisabledReason && <p className="diagnostic-card warning" role="status">{editingDisabledReason}</p>}
      {[...editDiagnostics, ...externalDiagnostics].length > 0 && (
        <div className="inspector-edit-errors" role="alert" aria-label="Inspector edit rejected">
          {[...editDiagnostics, ...externalDiagnostics].map((diagnostic) => <p key={`${diagnostic.code}:${diagnostic.message}`}><strong>{diagnostic.code}</strong>: {diagnostic.message}</p>)}
        </div>
      )}
      <fieldset disabled={entity.locked || !!editingDisabledReason || !onEntityChange}>
        <PropertySection title="Transform">
          <VectorEditor label="Position" value={candidate.transform.position} onChange={(axis, value) => setCandidate(updateTransform(candidate, "position", axis, value))}/>
          <VectorEditor label="Rotation" value={candidate.transform.rotationEuler} onChange={(axis, value) => setCandidate(updateTransform(candidate, "rotationEuler", axis, value))}/>
          <VectorEditor label="Scale" value={candidate.transform.scale} onChange={(axis, value) => setCandidate(updateTransform(candidate, "scale", axis, value))}/>
        </PropertySection>
        <PropertySection title="Entity details">
          {renderEditableEntityProperties(candidate, project, setCandidate)}
        </PropertySection>
        <button type="submit">Apply Inspector Changes</button>
      </fieldset>
    </form>
  );
}

function VectorEditor({label, value, onChange}: {
  readonly label: string;
  readonly value?: {readonly x: number; readonly y: number; readonly z: number};
  readonly onChange: (axis: "x" | "y" | "z", value: number) => void;
}) {
  return <div className="property-vector"><span>{label}</span><output aria-label={`${label} value`}>{formatVec(value)}</output>{(["x", "y", "z"] as const).map((axis) => (
    <label key={axis}>{axis.toUpperCase()}<input type="number" step="any" aria-label={`${label} ${axis.toUpperCase()}`} value={Number.isFinite(value?.[axis]) ? value![axis] : ""}
      onChange={(event) => onChange(axis, event.currentTarget.valueAsNumber)}/></label>
  ))}</div>;
}

function updateTransform(entity: SceneEntity, key: "position" | "rotationEuler" | "scale", axis: "x" | "y" | "z", value: number): SceneEntity {
  return {...entity, transform: {...entity.transform, [key]: {...entity.transform[key], [axis]: value}}} as SceneEntity;
}

function renderEditableEntityProperties(entity: SceneEntity, project: Project, setEntity: (entity: SceneEntity) => void) {
  switch (entity.kind) {
    case "geometry":
      return <>
        <label>Primitive<select value={entity.primitive} onChange={(event) => setEntity(changeGeometryPrimitive(entity, event.currentTarget.value as "box" | "sphere" | "cylinder"))}>
          <option value="box">box</option><option value="sphere">sphere</option><option value="cylinder">cylinder</option>
        </select></label>
        <label>Material<select value={entity.materialId ?? ""} onChange={(event) => setEntity({...entity, materialId: (event.currentTarget.value || undefined) as typeof entity.materialId})}>
          <option value="">unassigned</option>{project.scene.entities.filter((item) => item.kind === "material").map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
        </select></label>
        {Object.entries(entity.parameters).filter((entry): entry is [string, number] => typeof entry[1] === "number").map(([name, value]) => (
          <NumberEditor key={name} label={humanize(name)} value={value} onChange={(next) => setEntity({...entity, parameters: {...entity.parameters, [name]: next}})}/>
        ))}
      </>;
    case "material":
      return <>
        <label>Color<input aria-label="Color" type="color" value={entity.color} onChange={(event) => setEntity({...entity, color: event.currentTarget.value})}/></label>
        <NumberEditor label="Attenuation" value={entity.attenuationCoefficient} onChange={(value) => setEntity({...entity, attenuationCoefficient: value})}/>
        <NumberEditor label="Scatter probability" value={entity.scatterProbability} onChange={(value) => setEntity({...entity, scatterProbability: value})}/>
        <NumberEditor label="Absorption probability" value={entity.absorptionProbability} onChange={(value) => setEntity({...entity, absorptionProbability: value})}/>
      </>;
    case "source":
      return <>
        <label>Source<select value={entity.sourceKind} onChange={(event) => {
          const sourceKind = event.currentTarget.value as typeof entity.sourceKind;
          setEntity({...entity, sourceKind, direction: sourceKind === "pencil-beam" ? entity.direction ?? {x: 1, y: 0, z: 0} : entity.direction});
        }}>
          <option value="pencil-beam">pencil-beam</option><option value="point-isotropic">point-isotropic</option>
        </select></label>
        <label>Particle<select value={entity.particleType} onChange={(event) => setEntity({...entity, particleType: event.currentTarget.value as typeof entity.particleType})}>
          <option value="photon">photon</option><option value="neutron">neutron</option>
        </select></label>
        <NumberEditor label="Energy (MeV)" value={entity.energy} onChange={(value) => setEntity({...entity, energy: value})}/>
        <NumberEditor label="Strength" value={entity.strength} onChange={(value) => setEntity({...entity, strength: value})}/>
        {entity.sourceKind === "pencil-beam" && (
          <VectorEditor label="Direction" value={entity.direction}
            onChange={(axis, value) => setEntity({...entity, direction: {...(entity.direction ?? {x: 1, y: 0, z: 0}), [axis]: value}})}/>
        )}
      </>;
    case "tally":
      return <>
        <label>Tally<select value={entity.tallyKind} onChange={(event) => setEntity({...entity, tallyKind: event.currentTarget.value as typeof entity.tallyKind})}>
          <option value="voxel-flux">voxel-flux</option><option value="surface-crossing">surface-crossing</option><option value="detector-hit">detector-hit</option><option value="track-length">track-length</option><option value="event-density">event-density</option>
        </select></label>
        <div className="inspector-particle-options" aria-label="Tally particles">{(["photon", "neutron"] as const).map((particle) => <label key={particle}>
          <input type="checkbox" checked={entity.particleTypes.includes(particle)} onChange={(event) => setEntity({...entity, particleTypes: event.currentTarget.checked
            ? [...entity.particleTypes, particle]
            : entity.particleTypes.filter((item) => item !== particle)})}/>{particle}
        </label>)}</div>
        {entity.bins?.map((value, index) => <NumberEditor key={index} label={`Bins ${["X", "Y", "Z"][index]}`} value={value}
          onChange={(next) => setEntity({...entity, bins: entity.bins!.map((item, itemIndex) => itemIndex === index ? next : item) as unknown as typeof entity.bins})}/>) ?? <p className="muted">continuous bins</p>}
      </>;
  }
}

function changeGeometryPrimitive(
  entity: Extract<SceneEntity, {readonly kind: "geometry"}>,
  primitive: "box" | "sphere" | "cylinder",
): SceneEntity {
  const parameters: Record<string, number> = primitive === "box"
    ? {width: 1, height: 1, depth: 1}
    : primitive === "sphere"
      ? {radius: 1}
      : {radius: 1, height: 1};
  return {...entity, primitive, parameters};
}

function NumberEditor({label, value, onChange}: {readonly label: string; readonly value: number; readonly onChange: (value: number) => void}) {
  return <label>{label}<input aria-label={label} type="number" step="any" value={Number.isFinite(value) ? value : ""} onChange={(event) => onChange(event.currentTarget.valueAsNumber)}/></label>;
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

function humanize(value: string) {
  return value.replaceAll(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}
