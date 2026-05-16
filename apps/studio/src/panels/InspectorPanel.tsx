import type { Diagnostic, SceneEntity } from "@transport/domain";

interface InspectorPanelProps {
  readonly entity?: SceneEntity;
  readonly diagnostics: readonly Diagnostic[];
}

export function InspectorPanel({ entity, diagnostics }: InspectorPanelProps) {
  const entityDiagnostics = entity ? diagnostics.filter((diagnostic) => diagnostic.entityId === entity.id) : [];

  return (
    <section className="panel">
      <h2>Inspector</h2>
      {!entity ? (
        <p className="muted">Select an entity to inspect it.</p>
      ) : (
        <>
          <dl className="inspector-grid">
            <dt>Name</dt>
            <dd>{entity.name}</dd>
            <dt>Kind</dt>
            <dd>{entity.kind}</dd>
            <dt>Position</dt>
            <dd>
              {entity.transform.position.x.toFixed(2)}, {entity.transform.position.y.toFixed(2)}, {entity.transform.position.z.toFixed(2)}
            </dd>
            <dt>Scale</dt>
            <dd>
              {entity.transform.scale.x.toFixed(2)}, {entity.transform.scale.y.toFixed(2)}, {entity.transform.scale.z.toFixed(2)}
            </dd>
          </dl>

          {entityDiagnostics.length > 0 && (
            <div className="diagnostics-list">
              <h3>Diagnostics</h3>
              {entityDiagnostics.map((diagnostic, index) => (
                <p key={index} className={`diagnostic ${diagnostic.severity}`}>{diagnostic.message}</p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
