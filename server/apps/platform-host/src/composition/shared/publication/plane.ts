import type { PublicationPlane } from "@athyper/server-contract-publication";
import type { PlaneKey } from "@athyper/server-foundation/context";

/**
 * Maps the canonical Studio plane to the existing physical Athyper adapter.
 * Database and adapter names remain unchanged during the Foundation cutover.
 */
export function publicationPlaneToHostPlane(plane: PublicationPlane): PlaneKey {
  switch (plane) {
    case "studio":
      return "studio";
    case "neon":
      return "neon";
    case "mesh":
      return "mesh";
    default:
      return assertNever(plane);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported publication plane: ${String(value)}`);
}
