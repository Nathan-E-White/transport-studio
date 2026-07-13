import contractFixture from "../../../fixtures/contracts/native-execution-v2.json";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";

/** The native smoke MWE is the shared v2 conformance request itself. */
export function createNativePhotonSmokeFixtureProblem(): TransportProblem {
  return contractFixture.request.problem as TransportProblem;
}
