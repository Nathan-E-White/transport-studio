import type { TrackSample } from "@transport/domain";

interface TrackLinesProps {
  readonly tracks: readonly TrackSample[];
}

export function TrackLines({ tracks }: TrackLinesProps) {
  return (
      <group>
        {tracks.map((track) => (
            <TrackLine key={track.historyId} track={track} />
        ))}
      </group>
  );
}

function TrackLine({ track }: { readonly track: TrackSample }) {
  const points = track.events.map((event) => [event.position.x, event.position.y, event.position.z] as [number, number, number]);
  const terminal = track.events.at(-1);

  return (
      <group>
        <line>
          <bufferGeometry>
            <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array(points.flat()), 3]}
                count={points.length}
                itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={terminal?.type === "absorb" ? "#ff4d6d" : "#f8f7ff"} transparent opacity={0.7} />
        </line>
        {track.events.map((event, index) => (
            <mesh key={index} position={[event.position.x, event.position.y, event.position.z]}>
              <sphereGeometry args={[event.type === "scatter" ? 0.12 : 0.08, 12, 8]} />
              <meshStandardMaterial color={event.type === "absorb" ? "#ff4d6d" : event.type === "scatter" ? "#ffd166" : "#f8f7ff"} />
            </mesh>
        ))}
      </group>
  );
}
