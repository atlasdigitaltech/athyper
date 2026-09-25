import { MasterDataError } from "../../errors.js";

/** Replay follows persisted execution authority, never the newest writer. */
export function registrationMaterializer(input: {
  operationCode: unknown;
  requestedRole: unknown;
  status: unknown;
  materializerCode: unknown;
}): string | null {
  if (input.operationCode !== "new_partner" || input.requestedRole != null) return null;
  if (input.status !== "materialized") return "master.command_materialize_business_partner_registration_case";
  if (input.materializerCode === "neon.business_partner_registration") return "master.command_materialize_business_partner_registration_case";
  if (input.materializerCode === "neon.business_partner_role") return "master.command_materialize_business_partner_role_case";
  throw new MasterDataError(409, "PARTNER_REGISTRATION_REPLAY_AUTHORITY_UNKNOWN", "Registration replay requires its recorded materialization authority");
}
