import {
  parseEntitySuccessorTargetPin,
  type LocalPublicationRequest,
  type PublicationPlane,
} from "@athyper/server-contract-publication";

/** Turn the admitted absence into the explicit expectation signed by the worker. */
export function localSuccessorPin(
  request: LocalPublicationRequest,
  plane: PublicationPlane,
  publicationKey: string,
  releaseNo: number,
) {
  const target = request.inputs.targets.find((t) => t.plane === plane);
  if (!target) throw Error("LOCAL_PUBLICATION_TARGET_REQUIRED");
  if (target.predecessor)
    return parseEntitySuccessorTargetPin(target.predecessor);
  const predecessor = request.inputs.release?.predecessorReleaseId;
  if (!predecessor && releaseNo === 1) return undefined;
  if (
    !predecessor ||
    releaseNo <= 1 ||
    target.predecessorHash !== null ||
    plane === "studio"
  )
    throw Error("LOCAL_PUBLICATION_PREDECESSOR_EVIDENCE_REQUIRED");
  return parseEntitySuccessorTargetPin({
    plane,
    environment: request.admission.host.environment,
    instance: target.instance,
    publicationKey,
    sourceReleaseId: predecessor,
    sourceReleaseNo: releaseNo - 1,
    headState: "absent",
  });
}
