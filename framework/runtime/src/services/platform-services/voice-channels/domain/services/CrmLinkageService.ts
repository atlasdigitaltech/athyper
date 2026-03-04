/**
 * CRM Linkage Service — links calls/SMS to entity records.
 * Uses Kysely direct queries for cross-schema lookups.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type {
  CallSessionRepo,
  CallSession,
} from "../../persistence/CallSessionRepo.js";
import type { SmsLogRepo, SmsLog } from "../../persistence/SmsLogRepo.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const ENTITY_TABLE = "ent.entity_record" as keyof DB & string;

// ── Types ────────────────────────────────────────────────────────────

export interface CrmEntity {
  id: string;
  tenantId: string;
  entityType: string;
  displayName: string | null;
}

// ── Service ──────────────────────────────────────────────────────────

export class CrmLinkageService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly callSessionRepo: CallSessionRepo,
    private readonly smsLogRepo: SmsLogRepo,
    private readonly logger: Logger,
  ) {}

  async linkCallToEntity(
    tenantId: string,
    sessionId: string,
    entityType: string,
    entityId: string,
    updatedBy: string,
  ): Promise<void> {
    await this.callSessionRepo.updateCrmLink(
      tenantId,
      sessionId,
      entityType,
      entityId,
      updatedBy,
    );
    this.logger.info(
      { tenantId, sessionId, entityType, entityId },
      "[crm] Call linked to entity",
    );
  }

  async linkSmsToEntity(
    tenantId: string,
    smsLogId: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await this.smsLogRepo.updateCrmLink(
      tenantId,
      smsLogId,
      entityType,
      entityId,
    );
    this.logger.info(
      { tenantId, smsLogId, entityType, entityId },
      "[crm] SMS linked to entity",
    );
  }

  async findEntityByPhone(
    tenantId: string,
    phone: string,
  ): Promise<CrmEntity[]> {
    // Search for entities with matching phone in jsonb data column
    const rows = await (this.db as any)
      .selectFrom(ENTITY_TABLE)
      .select(["id", "tenant_id", "entity_type", "display_name"])
      .where("tenant_id", "=", tenantId)
      .where((eb: any) =>
        eb.or([
          eb("data", "@>", JSON.stringify({ phone })),
          eb("data", "@>", JSON.stringify({ phoneNumber: phone })),
          eb("data", "@>", JSON.stringify({ mobile: phone })),
        ]),
      )
      .limit(20)
      .execute();

    return rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      entityType: r.entity_type,
      displayName: r.display_name ?? null,
    }));
  }

  async getCallHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<CallSession[]> {
    return this.callSessionRepo.listByCrmEntity(tenantId, entityType, entityId);
  }

  async getSmsHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<SmsLog[]> {
    return this.smsLogRepo.listByCrmEntity(tenantId, entityType, entityId);
  }
}
