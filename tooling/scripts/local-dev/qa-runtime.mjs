import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
export function validateQaOwnership(receipt) {
  if (
    receipt?.kind !== "ActiveInstanceReceipt" ||
    receipt.metadata?.instance !== "qa" ||
    !/^athyper-qa(?:-candidate-[0-9]{13})?$/.test(receipt.spec?.project ?? "")
  )
    throw new Error("Recognized local QA ownership receipt required");
  return receipt.spec.project;
}
export function qaProject() {
  return validateQaOwnership(
    JSON.parse(
      readFileSync(
        join(homedir(), ".athyper/instances/qa/receipts/active.json"),
        "utf8",
      ),
    ),
  );
}
