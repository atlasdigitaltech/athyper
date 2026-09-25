import { MasterDataError } from "../../errors.js";

/** Bound work across both relationship streams; never return a truncated success page. */
export function relationshipScanBudget(maxRows = 1000): (rows: number) => void {
  let remaining = maxRows;
  return (rows) => {
    remaining -= rows;
    if (remaining < 0) throw new MasterDataError(503, "BP_360_RELATIONSHIP_SCAN_LIMIT", "Relationship scan limit reached. Narrow the scope and retry.");
  };
}
