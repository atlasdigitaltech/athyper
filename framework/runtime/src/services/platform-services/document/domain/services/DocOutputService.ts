/**
 * DocOutputService — Output lifecycle management.
 *
 * Handles output retrieval, status transitions, download URLs,
 * and integrity verification.
 */

import { createHash } from "node:crypto";

import type { Logger } from "../../../../../kernel/logger.js";
import type { DocStorageAdapter } from "../../adapters/DocStorageAdapter.js";
import type { DocOutputRepo } from "../../persistence/DocOutputRepo.js";
import type { DocOutput } from "../models/DocOutput.js";
import type { OutputId, OutputListFilters } from "../types.js";

export class DocOutputService {
    constructor(
        private readonly outputRepo: DocOutputRepo,
        private readonly storageAdapter: DocStorageAdapter,
        private readonly logger: Logger,
    ) {}

    async getById(tenantId: string, outputId: OutputId): Promise<DocOutput | undefined> {
        const output = await this.outputRepo.getById(outputId);
        if (output && output.tenantId !== tenantId) return undefined;
        return output;
    }

    async listByEntity(tenantId: string, entityName: string, entityId: string): Promise<DocOutput[]> {
        return this.outputRepo.listByEntity(tenantId, entityName, entityId);
    }

    async list(tenantId: string, filters?: OutputListFilters): Promise<DocOutput[]> {
        return this.outputRepo.list(tenantId, filters);
    }

    async markDelivered(outputId: OutputId): Promise<void> {
        const output = await this.outputRepo.getById(outputId);
        if (!output) throw new Error(`Output not found: ${outputId}`);
        if (output.status !== "RENDERED") {
            throw new Error(`Cannot mark as delivered: output is in '${output.status}' status`);
        }

        await this.outputRepo.updateStatus(outputId, "DELIVERED");
        this.logger.info({ outputId }, "[doc:output] Marked as delivered");
    }

    async markArchived(outputId: OutputId): Promise<void> {
        const output = await this.outputRepo.getById(outputId);
        if (!output) throw new Error(`Output not found: ${outputId}`);

        await this.outputRepo.updateStatus(outputId, "ARCHIVED");
        this.logger.info({ outputId }, "[doc:output] Archived");
    }

    async revoke(outputId: OutputId, revokedBy: string, reason: string): Promise<void> {
        const output = await this.outputRepo.getById(outputId);
        if (!output) throw new Error(`Output not found: ${outputId}`);
        if (output.status === "REVOKED") {
            throw new Error("Output is already revoked");
        }

        await this.outputRepo.updateStatus(outputId, "REVOKED", {
            revoked_at: new Date(),
            revoked_by: revokedBy,
            revoke_reason: reason,
        });

        this.logger.info({ outputId, revokedBy, reason }, "[doc:output] Revoked");
    }

    async getDownloadUrl(outputId: OutputId, tenantId: string): Promise<string> {
        const output = await this.getById(tenantId, outputId);
        if (!output) throw new Error(`Output not found: ${outputId}`);
        if (!output.storageKey) throw new Error("Output has no storage key");
        if (output.status === "REVOKED") throw new Error("Cannot download revoked output");

        return this.storageAdapter.getPresignedDownloadUrl(output.storageKey);
    }

    /**
     * Stream output PDF directly from storage.
     * Returns buffer + metadata for setting response headers.
     */
    async getStreamableOutput(outputId: OutputId, tenantId: string): Promise<{
        buffer: Buffer;
        filename: string;
        checksum: string | null;
        sizeBytes: number;
    }> {
        const output = await this.getById(tenantId, outputId);
        if (!output) throw new Error(`Output not found: ${outputId}`);
        if (!output.storageKey) throw new Error("Output has no storage key");
        if (output.status === "REVOKED") throw new Error("Cannot download revoked output");

        const buffer = await this.storageAdapter.retrieve(output.storageKey);
        const filename = `${output.entityName}-${output.entityId}-${output.operation}.pdf`;

        return {
            buffer,
            filename,
            checksum: output.checksum,
            sizeBytes: buffer.length,
        };
    }

    async verifyIntegrity(outputId: OutputId, tenantId: string): Promise<{
        valid: boolean;
        storedChecksum: string | null;
        computedChecksum: string | null;
    }> {
        const output = await this.getById(tenantId, outputId);
        if (!output) throw new Error(`Output not found: ${outputId}`);
        if (!output.storageKey || !output.checksum) {
            return { valid: false, storedChecksum: output.checksum, computedChecksum: null };
        }

        try {
            const buffer = await this.storageAdapter.retrieve(output.storageKey);
            const computedChecksum = createHash("sha256").update(buffer).digest("hex");
            const valid = computedChecksum === output.checksum;

            if (!valid) {
                this.logger.warn(
                    { outputId, storedChecksum: output.checksum, computedChecksum },
                    "[doc:output] Integrity check FAILED — checksum mismatch",
                );
            }

            return { valid, storedChecksum: output.checksum, computedChecksum };
        } catch (error) {
            this.logger.error(
                { outputId, error: String(error) },
                "[doc:output] Integrity check error — could not retrieve file",
            );
            return { valid: false, storedChecksum: output.checksum, computedChecksum: null };
        }
    }
}
