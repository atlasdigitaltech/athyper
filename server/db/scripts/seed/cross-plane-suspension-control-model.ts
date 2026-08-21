export const SUSPENSION_CONTROL_CLASSES = [
  "local_business_deny",
  "principal_suspension",
  "tenant_organization_suspension",
  "identity_provider_session_invalidation",
  "emergency_platform_kill_switch",
] as const;

export type SuspensionControlClass = typeof SUSPENSION_CONTROL_CLASSES[number];
export type ImplementationStatus = "implemented_local" | "partial" | "not_implemented";

export interface SuspensionControlContract {
  readonly contractVersion: "athyper.authorization.cross-plane-suspension-control.v1";
  readonly controlVersion: string;
  readonly scopeStatement: string;
  readonly controls: readonly SuspensionControl[];
  readonly deliveryPriorities: readonly DeliveryPriority[];
  readonly reportCorrections: {
    readonly removedClaims: readonly string[];
    readonly releaseBlockerStatement: string;
  };
}

export interface SuspensionControl {
  readonly id: string;
  readonly controlClass: SuspensionControlClass;
  readonly implementationStatus: ImplementationStatus;
  readonly authoritativeSource: {
    readonly ownership: "plane_local" | "studio" | "identity_provider" | "unassigned";
    readonly coordinates: readonly string[];
    readonly statement: string;
  };
  readonly targetPlanes: readonly string[];
  readonly propagation: {
    readonly mode: "local_transaction" | "studio_reconciliation" | "external_api_and_session_store" | "none";
    readonly mechanisms: readonly string[];
    readonly orchestrator: string | null;
    readonly convergence: {
      readonly guarantee: "transactional_local" | "durable_eventual" | "best_effort" | "none";
      readonly objectiveSeconds: number | null;
      readonly measured: boolean;
      readonly statement: string;
    };
    readonly failureBehavior: string;
  };
  readonly auditEvidence: {
    readonly required: readonly string[];
    readonly current: readonly string[];
    readonly gaps: readonly string[];
  };
  readonly recovery: {
    readonly authority: string;
    readonly steps: readonly string[];
    readonly verification: readonly string[];
  };
  readonly limitations: readonly string[];
}

export interface DeliveryPriority {
  readonly id: "W1A" | "W1B" | "W2" | "W5" | "W4" | "W3" | "W6";
  readonly title: string;
  readonly criterion: "release_blocker" | "operational_release_criterion" | "security_hardening" | "control_contract";
}

export function validateSuspensionControlContract(contract: SuspensionControlContract): void {
  if (contract.contractVersion !== "athyper.authorization.cross-plane-suspension-control.v1") {
    throw new Error("invalid suspension-control contract version");
  }
  required(contract.controlVersion, "controlVersion");
  required(contract.scopeStatement, "scopeStatement");
  unique(contract.controls.map((control) => control.id), "suspension control id");
  unique(contract.controls.map((control) => control.controlClass), "suspension control class");
  const classes = new Set(contract.controls.map((control) => control.controlClass));
  for (const expected of SUSPENSION_CONTROL_CLASSES) {
    if (!classes.has(expected)) throw new Error(`missing suspension control class: ${expected}`);
  }
  if (contract.controls.length !== SUSPENSION_CONTROL_CLASSES.length) {
    throw new Error("suspension contract must contain exactly one entry per control class");
  }

  for (const control of contract.controls) validateControl(control);

  const expectedPriority = ["W1A", "W1B", "W2", "W5", "W4", "W3", "W6"];
  if (contract.deliveryPriorities.map((item) => item.id).join(",") !== expectedPriority.join(",")) {
    throw new Error("authorization delivery priorities are incomplete or out of order");
  }
  for (const item of contract.deliveryPriorities) required(item.title, `${item.id}.title`);
  for (const id of ["W1A", "W1B", "W2", "W5"] as const) {
    if (contract.deliveryPriorities.find((item) => item.id === id)?.criterion !== "release_blocker") {
      throw new Error(`${id} must remain a release blocker`);
    }
  }
  if (contract.deliveryPriorities.find((item) => item.id === "W4")?.criterion !== "operational_release_criterion") {
    throw new Error("W4 must remain an operational release criterion");
  }
  if (contract.reportCorrections.removedClaims.length === 0) throw new Error("report corrections must name removed claims");
  required(contract.reportCorrections.releaseBlockerStatement, "releaseBlockerStatement");
  if (/W1(?:A|B|\s+is)?\s+(?:the\s+)?only release blocker/i.test(contract.reportCorrections.releaseBlockerStatement)) {
    throw new Error("release blocker statement still overclaims W1 exclusivity");
  }
}

function validateControl(control: SuspensionControl): void {
  required(control.id, "control.id");
  required(control.authoritativeSource.statement, `${control.id}.authoritativeSource.statement`);
  nonempty(control.authoritativeSource.coordinates, `${control.id}.authoritativeSource.coordinates`);
  nonempty(control.targetPlanes, `${control.id}.targetPlanes`);
  nonempty(control.propagation.mechanisms, `${control.id}.propagation.mechanisms`);
  required(control.propagation.convergence.statement, `${control.id}.convergence.statement`);
  required(control.propagation.failureBehavior, `${control.id}.failureBehavior`);
  nonempty(control.auditEvidence.required, `${control.id}.auditEvidence.required`);
  nonempty(control.recovery.steps, `${control.id}.recovery.steps`);
  nonempty(control.recovery.verification, `${control.id}.recovery.verification`);
  required(control.recovery.authority, `${control.id}.recovery.authority`);

  const convergence = control.propagation.convergence;
  if (control.implementationStatus === "not_implemented") {
    if (control.propagation.mode !== "none" || control.propagation.orchestrator !== null
      || convergence.guarantee !== "none" || convergence.objectiveSeconds !== null || convergence.measured) {
      throw new Error(`${control.id} cannot claim propagation or convergence while not implemented`);
    }
    if (control.auditEvidence.gaps.length === 0 || control.limitations.length === 0) {
      throw new Error(`${control.id} must disclose evidence and implementation gaps`);
    }
  }
  if (convergence.guarantee === "transactional_local" && control.targetPlanes.some((plane) => plane !== "origin_plane")) {
    throw new Error(`${control.id} cannot claim transactional convergence across planes`);
  }
  if (convergence.guarantee === "durable_eventual") {
    if (!control.propagation.orchestrator || convergence.objectiveSeconds === null || !convergence.measured) {
      throw new Error(`${control.id} durable convergence requires an orchestrator and measured objective`);
    }
  }
  if (control.targetPlanes.includes("studio_neon_mesh") && convergence.guarantee !== "durable_eventual") {
    throw new Error(`${control.id} cannot claim all-plane propagation without proven durable convergence`);
  }
  if (control.controlClass === "principal_suspension"
    && control.propagation.mechanisms.some((mechanism) => /application_projection/i.test(mechanism))) {
    throw new Error("application_projection is organization admission, not principal suspension");
  }
  if (control.controlClass === "tenant_organization_suspension"
    && !control.limitations.some((limitation) => /not.*principal|principal.*not/i.test(limitation))) {
    throw new Error("organization suspension must state that it is not principal-specific suspension");
  }
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}
function nonempty(values: readonly string[], label: string): void {
  if (values.length === 0 || values.some((value) => !value.trim())) throw new Error(`${label} must be non-empty`);
}
function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`duplicate ${label}`);
}
