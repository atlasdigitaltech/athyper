/**
 * DocAuditEmitter — Centralized audit event emission for the DOC module.
 *
 * Provides typed methods for all document lifecycle audit events.
 */

import type { AuditWriter } from "../../../../../kernel/audit.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { DocErrorCode } from "../types.js";

interface AuditActor {
    kind: "user" | "system";
    userId?: string;
}

export class DocAuditEmitter {
    constructor(
        private readonly auditWriter: AuditWriter,
        private readonly logger: Logger,
    ) {}

    // ── Template Events ─────────────────────────────────────────────

    async templateCreated(actor: AuditActor, tenantId: string, templateId: string, code: string): Promise<void> {
        await this.emit("doc.template.created", actor, { tenantId, templateId, code });
    }

    async templatePublished(actor: AuditActor, tenantId: string, templateId: string, versionId: string): Promise<void> {
        await this.emit("doc.template.published", actor, { tenantId, templateId, versionId });
    }

    async templateRetired(actor: AuditActor, tenantId: string, templateId: string): Promise<void> {
        await this.emit("doc.template.retired", actor, { tenantId, templateId });
    }

    async versionCreated(actor: AuditActor, tenantId: string, templateId: string, version: number): Promise<void> {
        await this.emit("doc.template.version_created", actor, { tenantId, templateId, version });
    }

    // ── Binding Events ──────────────────────────────────────────────

    async bindingCreated(actor: AuditActor, tenantId: string, bindingId: string): Promise<void> {
        await this.emit("doc.binding.created", actor, { tenantId, bindingId });
    }

    async bindingChanged(actor: AuditActor, tenantId: string, bindingId: string): Promise<void> {
        await this.emit("doc.binding.changed", actor, { tenantId, bindingId });
    }

    // ── Brand Events ────────────────────────────────────────────────

    async letterheadChanged(actor: AuditActor, tenantId: string, letterheadId: string): Promise<void> {
        await this.emit("doc.letterhead.changed", actor, { tenantId, letterheadId });
    }

    async brandProfileChanged(actor: AuditActor, tenantId: string, profileId: string): Promise<void> {
        await this.emit("doc.brand_profile.changed", actor, { tenantId, profileId });
    }

    // ── Render Events ───────────────────────────────────────────────

    async renderQueued(tenantId: string, outputId: string): Promise<void> {
        await this.emit("doc.render.queued", { kind: "system" }, { tenantId, outputId });
    }

    async renderCompleted(tenantId: string, outputId: string, checksum: string, durationMs: number): Promise<void> {
        await this.emit("doc.render.completed", { kind: "system" }, { tenantId, outputId, checksum, durationMs });
    }

    async renderFailed(tenantId: string, outputId: string, errorCode: DocErrorCode): Promise<void> {
        await this.emit("doc.render.failed", { kind: "system" }, { tenantId, outputId, errorCode }, "warn");
    }

    // ── Output Events ───────────────────────────────────────────────

    async outputDownloaded(actor: AuditActor, tenantId: string, outputId: string): Promise<void> {
        await this.emit("doc.output.downloaded", actor, { tenantId, outputId });
    }

    async outputRevoked(actor: AuditActor, tenantId: string, outputId: string, reason: string): Promise<void> {
        await this.emit("doc.output.revoked", actor, { tenantId, outputId, reason }, "warn");
    }

    async outputDelivered(tenantId: string, outputId: string): Promise<void> {
        await this.emit("doc.output.delivered", { kind: "system" }, { tenantId, outputId });
    }

    // ── Private ─────────────────────────────────────────────────────

    private async emit(
        type: string,
        actor: AuditActor,
        meta: Record<string, unknown>,
        level: "info" | "warn" = "info",
    ): Promise<void> {
        try {
            await this.auditWriter.write({
                ts: new Date().toISOString(),
                type,
                level,
                actor,
                meta,
            });
        } catch (err) {
            this.logger.warn(
                { type, error: String(err) },
                "[doc:audit] Failed to emit audit event (best-effort)",
            );
        }
    }
}
