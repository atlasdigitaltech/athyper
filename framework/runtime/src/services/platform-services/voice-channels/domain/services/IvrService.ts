/**
 * IVR Service — manages IVR flow definitions and step execution.
 * Uses Kysely directly (no separate IvrFlowRepo — simple CRUD table).
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "collab.ivr_flow" as keyof DB & string;

// ── Types ────────────────────────────────────────────────────────────

export interface IvrStep {
  type:
    | "say"
    | "play"
    | "gather"
    | "dial"
    | "record"
    | "pause"
    | "redirect"
    | "hangup";
  content?: string;
  options?: Record<string, unknown>;
  nextStepOnInput?: Record<string, number>;
  nextStep?: number;
}

export interface IvrFlow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  steps: IvrStep[];
  isActive: boolean;
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface IvrStepResult {
  twiml: string;
  nextStepIndex: number | null;
  completed: boolean;
}

// ── Service ──────────────────────────────────────────────────────────

export class IvrService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly logger: Logger,
  ) {}

  async getFlow(tenantId: string, id: string): Promise<IvrFlow | undefined> {
    const row = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async getFlowByCode(
    tenantId: string,
    code: string,
  ): Promise<IvrFlow | undefined> {
    const row = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async listFlows(
    tenantId: string,
    opts?: { isActive?: boolean; limit?: number; offset?: number },
  ): Promise<IvrFlow[]> {
    let q = (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (opts?.isActive !== undefined)
      q = q.where("is_active", "=", opts.isActive);
    q = q.orderBy("created_at", "desc");
    if (opts?.limit) q = q.limit(opts.limit);
    if (opts?.offset) q = q.offset(opts.offset);

    const rows = await q.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async createFlow(
    tenantId: string,
    input: {
      code: string;
      name: string;
      description?: string;
      steps: IvrStep[];
      createdBy: string;
    },
  ): Promise<IvrFlow> {
    const row = await (this.db as any)
      .insertInto(TABLE)
      .values({
        tenant_id: tenantId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        steps: JSON.stringify(input.steps),
        created_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async updateFlow(
    tenantId: string,
    id: string,
    input: {
      name?: string;
      description?: string;
      steps?: IvrStep[];
      isActive?: boolean;
      updatedBy: string;
    },
  ): Promise<void> {
    const values: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: input.updatedBy,
    };
    if (input.name !== undefined) values.name = input.name;
    if (input.description !== undefined) values.description = input.description;
    if (input.isActive !== undefined) values.is_active = input.isActive;
    if (input.steps !== undefined) {
      values.steps = JSON.stringify(input.steps);
      // Increment version on structure changes
      values.version = (this.db as any).raw("version + 1");
    }

    await (this.db as any)
      .updateTable(TABLE)
      .set(values)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  executeFlowStep(
    flow: IvrFlow,
    stepIndex: number,
    userInput?: string,
  ): IvrStepResult {
    if (stepIndex < 0 || stepIndex >= flow.steps.length) {
      return {
        twiml: "<Response><Hangup/></Response>",
        nextStepIndex: null,
        completed: true,
      };
    }

    const step = flow.steps[stepIndex];
    let twiml = "<Response>";
    let nextStepIndex: number | null = null;

    switch (step.type) {
      case "say":
        twiml += `<Say>${this.escapeXml(step.content ?? "")}</Say>`;
        nextStepIndex = step.nextStep ?? stepIndex + 1;
        break;

      case "play":
        twiml += `<Play>${this.escapeXml(step.content ?? "")}</Play>`;
        nextStepIndex = step.nextStep ?? stepIndex + 1;
        break;

      case "gather": {
        const actionUrl = step.options?.actionUrl ?? "";
        twiml += `<Gather action="${this.escapeXml(String(actionUrl))}" numDigits="${step.options?.numDigits ?? 1}">`;
        if (step.content) twiml += `<Say>${this.escapeXml(step.content)}</Say>`;
        twiml += "</Gather>";

        // Route based on user input
        if (userInput && step.nextStepOnInput) {
          nextStepIndex =
            step.nextStepOnInput[userInput] ?? step.nextStep ?? stepIndex + 1;
        } else {
          nextStepIndex = step.nextStep ?? stepIndex + 1;
        }
        break;
      }

      case "dial":
        twiml += `<Dial>${this.escapeXml(step.content ?? "")}</Dial>`;
        nextStepIndex = step.nextStep ?? stepIndex + 1;
        break;

      case "record": {
        const recordAction = step.options?.actionUrl ?? "";
        twiml += `<Record action="${this.escapeXml(String(recordAction))}" maxLength="${step.options?.maxLength ?? 120}"/>`;
        nextStepIndex = step.nextStep ?? stepIndex + 1;
        break;
      }

      case "pause":
        twiml += `<Pause length="${step.options?.length ?? 1}"/>`;
        nextStepIndex = step.nextStep ?? stepIndex + 1;
        break;

      case "redirect":
        twiml += `<Redirect>${this.escapeXml(step.content ?? "")}</Redirect>`;
        nextStepIndex = null;
        break;

      case "hangup":
        twiml += "<Hangup/>";
        nextStepIndex = null;
        break;
    }

    twiml += "</Response>";

    const completed =
      nextStepIndex === null || nextStepIndex >= flow.steps.length;

    this.logger.debug(
      { flowId: flow.id, stepIndex, stepType: step.type, nextStepIndex },
      "[ivr] Step executed",
    );

    return {
      twiml,
      nextStepIndex: completed ? null : nextStepIndex,
      completed,
    };
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private mapRow(row: any): IvrFlow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      steps: (this.parseJson(row.steps) as IvrStep[]) ?? [],
      isActive: row.is_active,
      version: row.version,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
      updatedBy: row.updated_by ?? null,
    };
  }

  private parseJson(value: unknown): unknown | null {
    if (value == null) return null;
    if (typeof value === "object") return value;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  }
}
