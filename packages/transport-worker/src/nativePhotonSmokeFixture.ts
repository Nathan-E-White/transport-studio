import contractFixture from "../../../fixtures/contracts/native-execution-v1.json";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";

/** The native smoke MWE is the shared wire-compatibility fixture itself. */
export function createNativePhotonSmokeFixtureProblem(): TransportProblem {
  return contractFixture.request.problem as TransportProblem;
}
