/**
 * Call Service — orchestrates outbound/inbound call lifecycle.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { ICtiAdapter } from "../../adapters/CtiAdapter.js";
import type { TelMetrics } from "../../observability/metrics.js";
import type { CallSessionRepo, CallSession } from "../../persistence/CallSessionRepo.js";

export class CallService {
    constructor(
        private readonly repo: CallSessionRepo,
        private readonly ctiAdapter: ICtiAdapter,
        private readonly metrics: TelMetrics,
        private readonly logger: Logger,
    ) {}

    async initiateOutbound(
        tenantId: string,
        from: string,
        to: string,
        createdBy: string,
        callbackUrl?: string,
    ): Promise<CallSession> {
        this.logger.info({ tenantId, to }, "[call] Initiating outbound call");

        const result = await this.ctiAdapter.initiateCall({
            from,
            to,
            callbackUrl,
            tenantId,
        });

        const session = await this.repo.create({
            tenantId,
            sessionRef: result.sessionRef,
            provider: result.provider,
            direction: "outbound",
            fromNumber: from,
            toNumber: to,
            callbackUrl,
            createdBy,
        });

        this.metrics.callInitiated({
            tenant: tenantId,
            direction: "outbound",
            provider: result.provider,
        });

        return session;
    }

    async handleStatusUpdate(
        tenantId: string,
        sessionRef: string,
        status: string,
        durationSeconds?: number,
    ): Promise<void> {
        const session = await this.repo.getByRef(tenantId, sessionRef);
        if (!session) {
            this.logger.warn({ tenantId, sessionRef }, "[call] Session not found for status update");
            return;
        }

        const isTerminal = ["completed", "failed", "busy", "no-answer", "canceled"].includes(status);

        await this.repo.updateStatus(tenantId, session.id, status, {
            durationSeconds,
            updatedBy: "webhook",
            endedAt: isTerminal ? new Date() : undefined,
        });

        if (isTerminal) {
            this.metrics.callCompleted({
                tenant: tenantId,
                direction: session.direction,
                status,
            });
            if (durationSeconds != null) {
                this.metrics.callDuration(durationSeconds, {
                    tenant: tenantId,
                    direction: session.direction,
                });
            }
        }

        this.logger.info({ sessionRef, status, durationSeconds }, "[call] Status updated");
    }

    async endCall(tenantId: string, sessionId: string, actorId: string): Promise<void> {
        const session = await this.repo.getById(tenantId, sessionId);
        if (!session) {
            throw new Error(`Call session not found: ${sessionId}`);
        }

        await this.ctiAdapter.endCall(session.sessionRef);

        await this.repo.updateStatus(tenantId, sessionId, "completed", {
            updatedBy: actorId,
            endedAt: new Date(),
        });

        this.logger.info({ sessionId, actorId }, "[call] Call ended by user");
    }

    async getSession(tenantId: string, id: string): Promise<CallSession | undefined> {
        return this.repo.getById(tenantId, id);
    }

    async listSessions(
        tenantId: string,
        opts?: { status?: string; direction?: string; limit?: number; offset?: number },
    ): Promise<CallSession[]> {
        return this.repo.list(tenantId, opts);
    }
}
