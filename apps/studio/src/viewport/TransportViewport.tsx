import {Canvas, useThree} from "@react-three/fiber";
import {Grid, Html, OrbitControls} from "@react-three/drei";
import type {Diagnostic, Project, SceneEntity, TrackSample, TransportTallyDelta} from "@transport/domain";
import type {EditorMode} from "../app/StudioApp";
import {TrackLines} from "./TrackLines";
import {useCallback, useEffect, useState, type JSX, type KeyboardEvent, type ReactNode} from "react";
import {Vector3} from "three";
import type {VisibilityTable} from "../state/editor";
import {getModeEntityEmphasis, isEntityKindSelectableInMode} from "../state/editor";
import {getViewportEntityPresentation, pickViewportEntity, type ViewportEntityPresentation} from "./viewportEntityPresentation";
import {createTallyResultPresentation, type TallyResultPresentation} from "./tallyResultPresentation";
import {resolveViewportKeyboardCommand, type ViewportKeyboardCommand} from "./viewportKeyboard";

interface TransportViewportProps {
    readonly project: Project;
    readonly tracks: readonly TrackSample[];
    readonly tallies: readonly TransportTallyDelta[];
    readonly tallyDiagnostics: readonly Diagnostic[];
    readonly selectedEntityId?: string;
    readonly onSelect: (entityId: string) => void;
    readonly showTallies: boolean;
    readonly showAxes: boolean;
    readonly mode: EditorMode;
    readonly visibility: VisibilityTable;
}

export function TransportViewport({
                                      project,
                                      tracks,
                                      tallies,
                                      tallyDiagnostics,
                                      selectedEntityId,
                                      onSelect,
                                      showTallies,
                                      showAxes,
                                      mode,
                                  visibility,
                                  }: TransportViewportProps) {
    const selectedEntity = project.scene.entities.find((entity) => entity.id === selectedEntityId);
    const tallyPresentation = createTallyResultPresentation(selectedEntity, tallies, tallyDiagnostics);
    const [cameraCommand, setCameraCommand] = useState<CameraCommand>({sequence: 0, type: "reset"});
    const [cameraStatus, setCameraStatus] = useState("Camera ready.");
    const [cameraPose, setCameraPose] = useState({position: "12.000,9.000,14.000", target: "0.000,0.000,0.000"});
    const selectedPresentation = selectedEntity ? getViewportEntityPresentation(selectedEntity, visibility) : undefined;

    function handleViewportKeyDown(event: KeyboardEvent<HTMLElement>) {
        const command = resolveViewportKeyboardCommand(event.nativeEvent, event.target, event.currentTarget);
        if (!command) return;
        event.preventDefault();
        if (command === "inspect") {
            const focusedEntityId = event.target instanceof HTMLElement ? event.target.dataset.entityId : undefined;
            const entityToInspect = focusedEntityId
                ? project.scene.entities.find((entity) => entity.id === focusedEntityId)
                : selectedEntity;
            const presentation = entityToInspect ? getViewportEntityPresentation(entityToInspect, visibility) : selectedPresentation;
            if (entityToInspect?.kind === "tally" && !showTallies) {
                setCameraStatus("Enable Tallies before focusing a tally entity.");
                return;
            }
            if (!entityToInspect || entityToInspect.kind === "material" || !presentation?.visible) {
                setCameraStatus("Select a visible geometry, source, or tally entity before pressing F.");
                return;
            }
            if (entityToInspect.id !== selectedEntityId) onSelect(entityToInspect.id);
            setCameraCommand((current) => ({sequence: current.sequence + 1, type: command, entity: entityToInspect}));
            setCameraStatus(`Focused ${entityToInspect.name}.`);
            return;
        }
        setCameraCommand((current) => ({sequence: current.sequence + 1, type: command}));
        setCameraStatus(CAMERA_STATUS[command]);
    }

    const handleCameraApplied = useCallback((position: Vector3, target: Vector3) => {
        setCameraPose({position: formatCameraVector(position), target: formatCameraVector(target)});
    }, []);

    return (
      <section id="transport-viewport" className="transport-viewport" role="region" aria-label="Transport viewport" tabIndex={0}
          aria-describedby="viewport-keyboard-help" onKeyDown={handleViewportKeyDown}
          data-camera-command={cameraCommand.type} data-camera-sequence={cameraCommand.sequence}
          data-camera-position={cameraPose.position} data-camera-target={cameraPose.target}>
        <Canvas camera={{position: [12, 9, 14], fov: 42}} shadows>
            <KeyboardCameraController command={cameraCommand} onApplied={handleCameraApplied}/>
            <color attach="background" args={["#070b16"]}/>
            <fog attach="fog" args={["#070b16", 22, 46]}/>
            <ambientLight intensity={0.7}/>
            <directionalLight position={[10, 12, 8]} intensity={1.4} castShadow={true}/>
            <pointLight position={[-8, 3, 0]} intensity={1.8} color="#00e5ff"/>
            <Grid args={[34, 34]} cellSize={1} sectionSize={5} fadeDistance={42} fadeStrength={1.8}/>

            {project.scene.entities.map((entity) => {
              const presentation = getViewportEntityPresentation(entity, visibility);
              return {entity, presentation: {
                ...presentation,
                selectable: presentation.selectable && isEntityKindSelectableInMode(mode, entity.kind),
              }};
            })
              .filter(({presentation}) => presentation.visible)
              .map(({entity, presentation}) => (
                <EntityMesh
                    key={entity.id}
                    entity={entity}
                    selected={entity.id === selectedEntityId}
                    onSelect={onSelect}
                    showTallies={showTallies}
                    mode={mode}
                    presentation={presentation}
                />
            ))}

            <TrackLines tracks={tracks}/>
            {tracks.length > 0 && <EventMarkers tracks={tracks}/>}
            {showTallies && <TallyResultOverlay entity={selectedEntity} presentation={tallyPresentation}/>}
            {showAxes && <AxesOverlay/>}
            <OrbitControls makeDefault enableDamping dampingFactor={0.08}/>
        </Canvas>
        <p id="viewport-keyboard-help" className="viewport-keyboard-help">Keyboard: W/A/S/D move · Q/E height · F focus selection · Home reset</p>
        <p className="viewport-camera-status" role="status">{cameraStatus}</p>
      </section>
    );
}

interface CameraCommand {
    readonly sequence: number;
    readonly type: ViewportKeyboardCommand;
    readonly entity?: SceneEntity;
}

const CAMERA_STATUS: Readonly<Record<Exclude<ViewportKeyboardCommand, "inspect">, string>> = {
    forward: "Camera moved forward.",
    backward: "Camera moved backward.",
    left: "Camera moved left.",
    right: "Camera moved right.",
    down: "Camera moved down.",
    up: "Camera moved up.",
    reset: "Camera reset to the default view.",
};

function KeyboardCameraController({command, onApplied}: {
    readonly command: CameraCommand;
    readonly onApplied: (position: Vector3, target: Vector3) => void;
}) {
    const {camera, controls} = useThree();
    useEffect(() => {
        if (command.sequence === 0) return;
        const orbit = controls as {target?: Vector3; update?: () => void} | null;
        const target = orbit?.target ?? new Vector3(0, 0, 0);
        const movement = new Vector3();
        const direction = new Vector3();
        camera.getWorldDirection(direction);
        direction.y = 0;
        if (direction.lengthSq() === 0) direction.set(0, 0, -1);
        direction.normalize();
        const right = new Vector3().crossVectors(direction, camera.up).normalize();

        switch (command.type) {
            case "forward": movement.copy(direction); break;
            case "backward": movement.copy(direction).multiplyScalar(-1); break;
            case "left": movement.copy(right).multiplyScalar(-1); break;
            case "right": movement.copy(right); break;
            case "down": movement.set(0, -1, 0); break;
            case "up": movement.set(0, 1, 0); break;
            case "reset":
                camera.position.set(12, 9, 14);
                target.set(0, 0, 0);
                camera.lookAt(target);
                orbit?.update?.();
                onApplied(camera.position, target);
                return;
            case "inspect": {
                const position = command.entity?.transform.position;
                if (!position) return;
                target.set(position.x, position.y, position.z);
                camera.position.set(position.x + 6, position.y + 4, position.z + 7);
                camera.lookAt(target);
                orbit?.update?.();
                onApplied(camera.position, target);
                return;
            }
        }
        camera.position.add(movement);
        target.add(movement);
        orbit?.update?.();
        onApplied(camera.position, target);
    }, [camera, command, controls, onApplied]);
    return null;
}

function formatCameraVector(vector: Vector3): string {
    return `${vector.x.toFixed(3)},${vector.y.toFixed(3)},${vector.z.toFixed(3)}`;
}

function TallyResultOverlay({entity, presentation}: {
    readonly entity?: SceneEntity;
    readonly presentation: TallyResultPresentation;
}) {
    if (!entity || entity.kind !== "tally" || presentation.status === "inactive") return null;
    const position: [number, number, number] = [entity.transform.position.x, entity.transform.position.y, entity.transform.position.z];
    if (presentation.status === "diagnostic") {
        return <Html position={position} center>
            <div className={`tally-result-diagnostic ${presentation.diagnostic.severity}`} role="status">
                <strong>{presentation.diagnostic.code}</strong>{presentation.diagnostic.message}
            </div>
        </Html>;
    }
    const rotation = entity.transform.rotationEuler;
    return <group position={position} rotation={[rotation.x, rotation.y, rotation.z]}
        scale={[entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z]}
        userData={{visualizationKind: presentation.kind, tallyId: presentation.tallyId}}>
        {presentation.cells.map((cell, index) => <mesh key={index} position={cell.position} scale={cell.scale}>
            <boxGeometry args={[1, 1, 1]}/>
            <meshBasicMaterial color={cell.sign === "negative" ? "#00c2ff" : cell.sign === "positive" ? "#ff4fd8" : "#9aa8c7"}
                transparent={true} opacity={0.18 + cell.intensity * 0.68}/>
        </mesh>)}
        <Html distanceFactor={13} position={[0, 0.9, 0]} center className="scene-label tally-result-label">
            <span aria-hidden="true">{presentation.label}</span>
            <span className="tally-result-sign-legend" aria-hidden="true">− negative · 0 zero · + positive</span>
            <span className="sr-only">{presentation.accessibleLabel}</span>
        </Html>
    </group>;
}

function EntityMesh({entity, selected, onSelect, showTallies, mode, presentation}: {
    readonly entity: SceneEntity;
    readonly selected: boolean;
    readonly onSelect: (id: string) => void;
    readonly showTallies: boolean;
    readonly mode: EditorMode;
    readonly presentation: ViewportEntityPresentation;
}) {

    const p = entity.transform.position;
    const s = entity.transform.scale;
    const position: [number, number, number] = [p.x, p.y, p.z];
    const scale: [number, number, number] = [s.x, s.y, s.z];
    const select = () => pickViewportEntity(entity, presentation, onSelect);
    const emphasis = getModeEntityEmphasis(mode, entity.kind);

    if (entity.kind === "material") return null;

    if (entity.kind === "source") {
        const direction = entity.direction ?? {x: 1, y: 0, z: 0};
        return (
            <group position={position} onClick={(event) => {
                event.stopPropagation();
                select();
            }} userData={presentation}>
                <mesh rotation={[0, 0, -Math.PI / 2]}>
                    <coneGeometry args={[0.38, 1.15, 32]}/>
                    <meshStandardMaterial color={selected ? "#ffd166" : "#00e5ff"}
                                          emissive={selected ? "#5a3d00" : "#003844"} emissiveIntensity={0.8}
                                          transparent={true} opacity={0.35 + emphasis * 0.65}
                                          wireframe={presentation.helperOnly || mode === "debug"}/>
                </mesh>
                <BeamGuide length={5.5} selected={selected}/>
                <Html distanceFactor={12} position={[0, 0.8, 0]} center className="scene-label">
                    <ViewportEntityPick entity={entity} mode={mode} presentation={presentation} onSelect={select}>
                        {entity.name}{presentation.helperOnly ? " · helper" : ""} · {direction.x.toFixed(0)},{direction.y.toFixed(0)},{direction.z.toFixed(0)}
                    </ViewportEntityPick>
                </Html>
            </group>
        );
    }

    if (entity.kind === "tally") {
        if (!showTallies) return null;
        return (
            <group position={position} scale={scale} onClick={(event) => {
                event.stopPropagation();
                select();
            }} userData={presentation}>
                <mesh>
                    <boxGeometry args={[1, 1, 1]}/>
                    <meshStandardMaterial color={selected ? "#ffd166" : "#3ddc97"} transparent={true}
                                          opacity={selected ? 0.48 : 0.12 + emphasis * 0.3}
                                          wireframe={mode === "debug"}/>
                </mesh>
                <mesh scale={[1.04, 1.04, 1.04]}>
                    <boxGeometry args={[1, 1, 1]}/>
                    <meshBasicMaterial color="#3ddc97" wireframe={true} transparent={true} opacity={0.35}/>
                </mesh>
                <Html distanceFactor={13} position={[0, 0.65, 0]} center
                      className="scene-label green"><ViewportEntityPick entity={entity} mode={mode} presentation={presentation} onSelect={select}>
                    {entity.name}{presentation.helperOnly ? " · helper" : ""}
                </ViewportEntityPick></Html>
            </group>
        );
    }


    const sg: JSX.Element = <sphereGeometry args={[1,32,16]}/>;
    const cg: JSX.Element = <cylinderGeometry args={[1,1,1,32]} />;
    const bg: JSX.Element = <boxGeometry args={[1,1,1]}/>;



    if (entity.kind === "geometry") {
        return (
            <group position={position} scale={scale} onClick={(event): void => {
                event.stopPropagation();
                select();
            }} userData={presentation}>
                <mesh castShadow={true} receiveShadow={true}>
                    {
                        entity.primitive === "sphere" ? sg :
                            entity.primitive === "cylinder" ? cg :
                                bg
                    }
                    <meshStandardMaterial color={selected ? "#ffd166" : "#7aa2ff"} transparent={true}
                                          opacity={presentation.helperOnly ? 0.24 : selected ? 0.68 : 0.12 + emphasis * 0.42}
                                          roughness={0.4} metalness={0.08} wireframe={presentation.helperOnly || mode === "debug"}/>
                </mesh>
                {selected && <SelectionBox/>}
                <Html distanceFactor={14} position={[0, 0.72, 0]} center
                      className="scene-label blue"><ViewportEntityPick entity={entity} mode={mode} presentation={presentation} onSelect={select}>
                    {entity.name}{presentation.helperOnly ? " · helper" : ""}
                </ViewportEntityPick></Html>
            </group>
        );
    }

    return null;
}

function ViewportEntityPick({entity, mode, presentation, onSelect, children}: {
    readonly entity: SceneEntity;
    readonly mode: EditorMode;
    readonly presentation: ViewportEntityPresentation;
    readonly onSelect: () => void;
    readonly children: ReactNode;
}) {
    return <button type="button" className="viewport-entity-pick"
        aria-label={`Select ${entity.name} in viewport`}
        data-viewport-entity-pick="true" data-entity-id={entity.id}
        title={presentation.selectable ? `Select ${entity.name}` : `${entity.name} is unavailable in ${mode} mode.`}
        disabled={!presentation.selectable}
        onClick={(event) => {event.stopPropagation(); onSelect();}}>{children}</button>;
}

function SelectionBox() {
    return (
        <mesh scale={[1.05, 1.05, 1.05]}>
            <boxGeometry args={[1, 1, 1]}/>
            <meshBasicMaterial color="#ffd166" wireframe={true} transparent={true} opacity={0.75}/>
        </mesh>
    );
}

function BeamGuide({length, selected}: { readonly length: number; readonly selected: boolean }) {
    return (
        <mesh position={[length / 2, 0, 0]}>
            <boxGeometry args={[length, 0.035, 0.035]}/>
            <meshBasicMaterial color={selected ? "#ffd166" : "#00e5ff"} transparent={true} opacity={0.7}/>
        </mesh>
    );
}

function EventMarkers({tracks}: { readonly tracks: readonly TrackSample[] }) {
    const events = tracks.flatMap((track) => track.events.filter((event) => event.type === "scatter" || event.type === "absorb" || event.type === "escape"));
    return (
        <group>
            {events.map((event, index) => (
                <mesh key={`${event.historyId}-${index}`}
                      position={[event.position.x, event.position.y, event.position.z]}>
                    <sphereGeometry args={[event.type === "scatter" ? 0.07 : 0.1, 12, 8]}/>
                    <meshBasicMaterial
                        color={event.type === "absorb" ? "#ff4d6d" : event.type === "escape" ? "#3ddc97" : "#ffd166"}
                        transparent={true} opacity={0.85}/>
                </mesh>
            ))}
        </group>
    );
}

function AxesOverlay() {
    return (
        <group>
            <Html position={[10, 0, 0]} className="axis-label">+X beam</Html>
            <Html position={[0, 5.5, 0]} className="axis-label">+Y</Html>
            <Html position={[0, 0, 5.5]} className="axis-label">+Z</Html>
        </group>
    );
}
