#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateSuspensionControlContract,
  type SuspensionControlContract,
} from "../../seed/cross-plane-suspension-control-model.js";

const path = resolve("seed/contracts/authorization/control/cross-plane-suspension-control.v1.json");
const contract = JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as SuspensionControlContract;
validateSuspensionControlContract(contract);
process.stdout.write(`${JSON.stringify({
  contractVersion: contract.contractVersion,
  controls: contract.controls.map((control) => ({
    id: control.id,
    status: control.implementationStatus,
    convergence: control.propagation.convergence.guarantee,
  })),
  deliveryPriorities: contract.deliveryPriorities,
}, null, 2)}\n`);
