interface LocalTransitionReceipt {
  basis: "local_development_authority";
  requestHash: string;
  revision: number;
  status: "in_review" | "approved" | "published";
  replayed: boolean;
}
/** SQL validates renewal lineage. A replay may equal its newly admitted revision;
 * a new transition must advance it, and neither may move backwards. */
export function validateLocalTransitionReceipt(
  rows: readonly { receipt: LocalTransitionReceipt }[],
  requestHash: string,
  admittedRevision: number,
  phase: "submit" | "review",
): LocalTransitionReceipt {
  const receipt = rows[0]?.receipt;
  if (
    rows.length !== 1 ||
    !receipt ||
    receipt.requestHash !== requestHash ||
    receipt.basis !== "local_development_authority" ||
    !Number.isSafeInteger(receipt.revision) ||
    receipt.revision < admittedRevision ||
    (receipt.revision === admittedRevision && receipt.replayed !== true) ||
    !["in_review", "approved", "published"].includes(receipt.status) ||
    (phase === "review" &&
      !["approved", "published"].includes(receipt.status)) ||
    typeof receipt.replayed !== "boolean"
  )
    throw Error("LOCAL_PUBLICATION_TRANSITION_RECEIPT_INVALID");
  return receipt;
}
