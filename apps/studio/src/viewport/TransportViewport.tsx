import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import type { Project, SceneEntity, TrackSample } from "@transport/domain";
import { TrackLines } from "./TrackLines";

interface TransportViewportProps {
  readonly project: Project;
  readonly tracks: readonly TrackSample[];
  readonly selectedEntityId?: string;
  readonly onSelect: (entityId: string) => void;
}

export function TransportViewport({ project, tracks, selectedEntityId, onSelect }: TransportViewportProps) {
  return (
    <Canvas camera={{ position: [12, 10, 14], fov: 45 }}>
      <color attach="background" args={["#0b1020"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} />
      <Grid args={[30, 30]} cellSize={1} sectionSize={5} fadeDistance={40} />
      {project.scene.entities.map((entity) => (
        <EntityMesh key={entity.id} entity={entity} selected={entity.id === selectedEntityId} onSelect={onSelect} />
      ))}
      <TrackLines tracks={tracks} />
      <OrbitControls makeDefault />
    </Canvas>
  );
}

function EntityMesh({ entity, selected, onSelect }: { readonly entity: SceneEntity; readonly selected: boolean; readonly onSelect: (id: string) => void }) {
  const p = entity.transform.position;
  const s = entity.transform.scale;

  if (entity.kind === "material") return null;

  if (entity.kind === "source") {
    return (
      <mesh position={[p.x, p.y, p.z]} onClick={(event) => { event.stopPropagation(); onSelect(entity.id); }}>
        <coneGeometry args={[0.35, 1.0, 24]} />
        <meshStandardMaterial color={selected ? "#ffd166" : "#00e5ff"} emissive={"#003844"} />
      </mesh>
    );
  }

  if (entity.kind === "tally") {
    return (
      <mesh position={[p.x, p.y, p.z]} scale={[s.x, s.y, s.z]} onClick={(event) => { event.stopPropagation(); onSelect(entity.id); }}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={selected ? "#ffd166" : "#3ddc97"} transparent opacity={0.25} />
      </mesh>
    );
  }

  if (entity.kind === "geometry") {
    return (
      <mesh position={[p.x, p.y, p.z]} scale={[s.x, s.y, s.z]} onClick={(event) => { event.stopPropagation(); onSelect(entity.id); }}>
        {entity.primitive === "sphere" ? <sphereGeometry args={[1, 32, 16]} /> : <boxGeometry args={[1, 1, 1]} />}
        <meshStandardMaterial color={selected ? "#ffd166" : "#7aa2ff"} transparent opacity={0.55} />
      </mesh>
    );
  }

  return null;
}
