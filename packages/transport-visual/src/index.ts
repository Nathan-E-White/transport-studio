import {TransportSourceContract, type TrackSample} from "@transport/domain";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";

export interface VisualTransportRunResult {
  readonly tracks: readonly TrackSample[];
}

export interface VisualTransportRunOptions {
  readonly visibleHistoryBudget: number;
}

export function runToyPhotonTransport(
  problem: TransportProblem,
  options: VisualTransportRunOptions,
): VisualTransportRunResult {
  const source = problem.sources[0];
  const visibleCount = Math.min(options.visibleHistoryBudget, problem.settings.histories);

  const tracks: TrackSample[] = Array.from({ length: visibleCount }, (_, index) => {
    const y = (index - visibleCount / 2) * 0.08;
    return {
      historyId: `h-${index}`,
      events: [
        {
          historyId: `h-${index}`,
          particleId: `p-${index}`,
          type: "birth",
          position: source && "position" in source ? source.position : { x: -8, y, z: 0 },
          direction: { x: 1, y: 0, z: 0 },
          energy: source ? TransportSourceContract.getRepresentativeEnergyMeV(source.energy) : 1,
          weight: 1,
          time: 0,
          reason: "toy photon birth"
        },
        {
          historyId: `h-${index}`,
          particleId: `p-${index}`,
          type: index % 5 === 0 ? "scatter" : "move",
          position: { x: 0, y: y + Math.sin(index) * 0.5, z: Math.cos(index) * 0.25 },
          direction: { x: 1, y: Math.sin(index) * 0.1, z: 0 },
          energy: 0.9,
          weight: 1,
          time: 1,
          reason: "toy interaction"
        },
        {
          historyId: `h-${index}`,
          particleId: `p-${index}`,
          type: index % 7 === 0 ? "absorb" : "escape",
          position: { x: 8, y: y + Math.sin(index) * 0.8, z: Math.cos(index) * 0.4 },
          direction: { x: 1, y: 0, z: 0 },
          energy: 0.8,
          weight: 1,
          time: 2,
          reason: index % 7 === 0 ? "toy absorption" : "toy escape"
        }
      ]
    };
  });

  return { tracks };
}
