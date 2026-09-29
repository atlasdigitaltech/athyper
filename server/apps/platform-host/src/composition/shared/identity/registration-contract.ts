import type { PlaneKey } from "@athyper/server-foundation/context";
import type {
  AuditEventSink,
  AuditRecorder,
} from "@athyper/server-contract-audit";
import type { TokenVerifier } from "@athyper/server-contract-auth";
import type {
  createIamService,
  IamServiceOptions,
  ProvisioningVertical,
} from "@athyper/server-platform-iam";

export interface PlatformRegistrationDependencies {
  /** Served planes are independent of coordination database access. */
  readonly servedPlanes?: readonly PlaneKey[];
  readonly tokenVerifier?: TokenVerifier;
  readonly auditSink?: AuditEventSink;
  readonly createAudit?: (sink: AuditEventSink) => AuditRecorder;
  readonly createIam?: typeof createIamService;
  /** Composition seam for an exact-plane identity authority; runtime defaults to Kysely. */
  readonly resolveIdentityContext?: NonNullable<
    IamServiceOptions["resolveIdentityContext"]
  >;
  readonly provisioning?: ProvisioningVertical;
}
