import type { PlaneDatabaseRegistry, RuntimePlaneKey } from "../runtime/plane-database-registry.js";
import { jitProvisionPrincipal, type JitPrincipalInput, type JitPrincipalResult } from "./jit.service.js";

export interface IdentityProvisioningRepository {
  provision(plane: RuntimePlaneKey, input: JitPrincipalInput): Promise<JitPrincipalResult | null>;
}

export class PlaneIdentityProvisioningRepository implements IdentityProvisioningRepository {
  constructor(private readonly databases: PlaneDatabaseRegistry) {}

  provision(plane: RuntimePlaneKey, input: JitPrincipalInput): Promise<JitPrincipalResult | null> {
    return jitProvisionPrincipal(this.databases.forPlane(plane).db, input);
  }
}
