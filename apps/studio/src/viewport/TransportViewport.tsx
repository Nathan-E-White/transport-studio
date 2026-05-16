import { Canvas } from "@react-three/fiber";
import { Grid, Html, OrbitControls } from "@react-three/drei";
import type { Project, SceneEntity, TrackSample } from "@transport/domain";
import type { EditorMode } from "../app/StudioApp";
import { TrackLines } from "./TrackLines";

interface TransportViewportProps {
    readonly project: Project;
    readonly tracks: readonly TrackSample[];
    readonly selectedEntityId?: string;
    readonly onSelect: (entityId: string) => void;
    readonly showTallies: boolean;
    readonly showDiagnostics: boolean;
    readonly mode: EditorMode;
}

export function TransportViewport({ project, tracks, selectedEntityId, onSelect, showTallies, showDiagnostics, mode }: TransportViewportProps) {
    return (
        <Canvas camera={{ position: [12, 9, 14], fov: 42 }} shadows>
            <color attach="background" args={["#070b16"]} />
            <fog attach="fog" args={["#070b16", 22, 46]} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 12, 8]} intensity={1.4} castShadow />
            <pointLight position={[-8, 3, 0]} intensity={1.8} color="#00e5ff" />
            <Grid args={[34, 34]} cellSize={1} sectionSize={5} fadeDistance={42} fadeStrength={1.8} />

            {project.scene.entities.map((entity) => (
                <EntityMesh
                    key={entity.id}
                    entity={entity}
                    selected={entity.id === selectedEntityId}
                    onSelect={onSelect}
                    showTallies={showTallies}
                    mode={mode}
                />
            ))}

            <TrackLines tracks={tracks} />
            {tracks.length > 0 && <EventMarkers tracks={tracks} />}
            {showDiagnostics && <AxisLabels />}
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
        </Canvas>
    );
}

function EntityMesh({ entity, selected, onSelect, showTallies, mode }: { readonly entity: SceneEntity; readonly selected: boolean; readonly onSelect: (id: string) => void; readonly showTallies: boolean; readonly mode: EditorMode }) {
    const p = entity.transform.position;
    const s = entity.transform.scale;
    const position: [number, number, number] = [p.x, p.y, p.z];
    const scale: [number, number, number] = [s.x, s.y, s.z];

    if (entity.kind === "material") return null;

    if (entity.kind === "source") {
        const direction = entity.direction ?? { x: 1, y: 0, z: 0 };
        return (
            <group position={position} onClick={(event) => { event.stopPropagation(); onSelect(entity.id); }}>
                <mesh rotation={[0, 0, -Math.PI / 2]}>
                    <coneGeometry args={[0.38, 1.15, 32]} />
                    <meshStandardMaterial color={selected ? "#ffd166" : "#00e5ff"} emissive={selected ? "#5a3d00" : "#003844"} emissiveIntensity={0.8} />
                </mesh>
                <BeamGuide length={5.5} selected={selected} />
                <Html distanceFactor={12} position={[0, 0.8, 0]} center className="scene-label">
                    {entity.name} · {direction.x.toFixed(0)},{direction.y.toFixed(0)},{direction.z.toFixed(0)}
                </Html>
            </group>
        );
    }

    if (entity.kind === "tally") {
        if (!showTallies) return null;
        return (
            <group position={position} scale={scale} onClick={(event) => { event.stopPropagation(); onSelect(entity.id); }}>
                <mesh>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial color={selected ? "#ffd166" : "#3ddc97"} transparent opacity={mode === "probe" || selected ? 0.35 : 0.22} wireframe={mode === "debug"} />
                </mesh>
                <mesh scale={[1.04, 1.04, 1.04]}>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshBasicMaterial color="#3ddc97" wireframe transparent opacity={0.35} />
                </mesh>
                <Html distanceFactor={13} position={[0, 0.65, 0]} center className="scene-label green">{entity.name}</Html>
            </group>
        );
    }

    if (entity.kind === "geometry") {
        return (
            <group position={position} scale={scale} onClick={(event) => { event.stopPropagation(); onSelect(entity.id); }}>
                <mesh castShadow receiveShadow>
                    {entity.primitive === "sphere" ? <sphereGeometry args={[1, 32, 16]} /> : entity.primitive === "cylinder" ? <cylinderGeometry args={[1, 1, 1, 32]} /> : <boxGeometry args={[1, 1, 1]} />}
                    <meshStandardMaterial color={selected ? "#ffd166" : "#7aa2ff"} transparent opacity={selected ? 0.68 : 0.48} roughness={0.4} metalness={0.08} />
                </mesh>
                {selected && <SelectionBox />}
                <Html distanceFactor={14} position={[0, 0.72, 0]} center className="scene-label blue">{entity.name}</Html>
            </group>
        );
    }

    return null;
}

function SelectionBox() {
    return (
        <mesh scale={[1.05, 1.05, 1.05]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#ffd166" wireframe transparent opacity={0.75} />
        </mesh>
    );
}

function BeamGuide({ length, selected }: { readonly length: number; readonly selected: boolean }) {
    return (
        <mesh position={[length / 2, 0, 0]}>
            <boxGeometry args={[length, 0.035, 0.035]} />
            <meshBasicMaterial color={selected ? "#ffd166" : "#00e5ff"} transparent opacity={0.7} />
        </mesh>
    );
}

function EventMarkers({ tracks }: { readonly tracks: readonly TrackSample[] }) {
    const events = tracks.flatMap((track) => track.events.filter((event) => event.type === "scatter" || event.type === "absorb" || event.type === "escape"));
    return (
        <group>
            {events.map((event, index) => (
                <mesh key={`${event.historyId}-${index}`} position={[event.position.x, event.position.y, event.position.z]}>
                    <sphereGeometry args={[event.type === "scatter" ? 0.07 : 0.1, 12, 8]} />
                    <meshBasicMaterial color={event.type === "absorb" ? "#ff4d6d" : event.type === "escape" ? "#3ddc97" : "#ffd166"} transparent opacity={0.85} />
                </mesh>
            ))}
        </group>
    );
}

function AxisLabels() {
    return (
        <group>
            <Html position={[10, 0, 0]} className="axis-label">+X beam</Html>
            <Html position={[0, 5.5, 0]} className="axis-label">+Y</Html>
            <Html position={[0, 0, 5.5]} className="axis-label">+Z</Html>
        </group>
    );
}
