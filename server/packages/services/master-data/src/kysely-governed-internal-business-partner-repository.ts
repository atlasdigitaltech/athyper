import type {
  GovernedEntityCaseResult,
  GovernedInternalBusinessPartnerCaseRepository,
} from "@athyper/server-contract-master-data";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";

type Database = Record<string, never>;
type Tx = Transaction<Database>;
type Row = {
  entity_case_id: string;
  snapshot_id?: string;
  result_snapshot_id?: string;
  row_version: string | number;
  status?: string;
  case_status?: string;
  replayed: boolean;
  outbox_id: string;
  business_partner_id?: string;
};

export class KyselyGovernedInternalBusinessPartnerCaseRepository implements GovernedInternalBusinessPartnerCaseRepository<Tx> {
  async createDraft(
    command: Parameters<
      GovernedInternalBusinessPartnerCaseRepository<Tx>["createDraft"]
    >[0],
    transaction: Tx,
  ) {
    return execute(async () =>
      map(
        (
          await sql<Row>`SELECT * FROM document.command_entity_case_draft(
      ${command.context.tenantId}::uuid,${command.caseId}::uuid,0::bigint,NULL::uuid,${command.caseCode},'master.business_partner','register',NULL::uuid,
      ${`internal-registration:${command.caseCode}`},${command.entityContractId}::uuid,${command.entityContractHash},${command.formTemplateReleaseId}::uuid,
      ${command.formTemplateReleaseNo}::bigint,${command.formTemplateHash},${JSON.stringify(command.payload)}::jsonb,${command.idempotencyKey},
      ${command.context.principalId}::uuid,${command.context.correlationId ?? null}::uuid
    )`.execute(transaction)
        ).rows[0],
      ),
    );
  }

  async transition(
    command: Parameters<
      GovernedInternalBusinessPartnerCaseRepository<Tx>["transition"]
    >[0],
    transaction: Tx,
  ) {
    return execute(async () =>
      map(
        (
          await sql<Row>`SELECT * FROM document.command_entity_case_lifecycle(
      ${command.context.tenantId}::uuid,${command.caseId}::uuid,${command.action},${command.expectedVersion}::bigint,
      ${command.cycleRunId}::uuid,${command.cycleTaskId}::uuid,${command.reason ?? null},${command.idempotencyKey},
      ${command.context.principalId}::uuid,${command.context.correlationId ?? null}::uuid
    )`.execute(transaction)
        ).rows[0],
      ),
    );
  }

  async materialize(
    command: Parameters<
      GovernedInternalBusinessPartnerCaseRepository<Tx>["materialize"]
    >[0],
    transaction: Tx,
  ) {
    return execute(async () => {
      const role = (
        await sql<{ requested_role: string | null }>`SELECT snapshot.payload_json->>'requestedRole' requested_role
        FROM document.entity_case governed_case
        JOIN snapshot.entity_snapshot snapshot
          ON snapshot.tenant_id=governed_case.tenant_id AND snapshot.snapshot_id=governed_case.decision_snapshot_id
        WHERE governed_case.tenant_id=${command.context.tenantId}::uuid AND governed_case.id=${command.caseId}::uuid`.execute(
          transaction,
        )
      ).rows[0]?.requested_role;
      const result =
        role === "supplier" || role === "customer"
          ? await sql<Row>`SELECT * FROM master.command_materialize_business_partner_role_case(
      ${command.context.tenantId}::uuid,${command.caseId}::uuid,${command.expectedVersion}::bigint,${command.idempotencyKey},
      ${command.context.principalId}::uuid,${command.context.correlationId ?? null}::uuid
    )`.execute(transaction)
          : await sql<Row>`SELECT * FROM master.command_materialize_internal_business_partner_case(
      ${command.context.tenantId}::uuid,${command.caseId}::uuid,${command.expectedVersion}::bigint,${command.idempotencyKey},
      ${command.context.principalId}::uuid,${command.context.correlationId ?? null}::uuid
    )`.execute(transaction);
      return map(result.rows[0]);
    });
  }
}

function map(row: Row | undefined): GovernedEntityCaseResult {
  if (!row)
    throw new MasterDataError(
      409,
      "GOVERNED_CASE_COMMAND_CONFLICT",
      "Governed case command returned no result",
    );
  const snapshotId = row.result_snapshot_id ?? row.snapshot_id;
  const status = row.case_status ?? row.status;
  if (
    !snapshotId ||
    !status ||
    !["draft", "submitted", "approved", "rejected", "returned", "materialized"].includes(
      status,
    )
  )
    throw new Error("GOVERNED_CASE_RESULT_INVALID");
  return {
    caseId: row.entity_case_id,
    snapshotId,
    rowVersion: Number(row.row_version),
    status: status as GovernedEntityCaseResult["status"],
    replayed: row.replayed,
    outboxId: row.outbox_id,
    ...(row.business_partner_id
      ? { businessPartnerId: row.business_partner_id }
      : {}),
  };
}

async function execute(
  work: () => Promise<GovernedEntityCaseResult>,
): Promise<GovernedEntityCaseResult> {
  try {
    return await work();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;
    if (code === "P0002")
      throw new MasterDataError(
        404,
        "GOVERNED_CASE_NOT_FOUND",
        "Governed entity case was not found",
      );
    if (code === "42501")
      throw new MasterDataError(
        403,
        "GOVERNED_CASE_AUTHORITY_DENIED",
        "Governed entity case authority or maker-checker rule denied the command",
      );
    if (code === "40001")
      throw new MasterDataError(
        409,
        "GOVERNED_CASE_VERSION_CONFLICT",
        "Governed entity case version is stale",
      );
    if (["23503", "23505", "23514", "55000"].includes(code ?? ""))
      throw new MasterDataError(
        409,
        "GOVERNED_CASE_COMMAND_CONFLICT",
        error instanceof Error
          ? error.message
          : "Governed entity case command conflict",
      );
    throw error;
  }
}
