// framework/runtime/src/kernel/audit.ts

export type AuditLevel = "info" | "warn" | "error";

export type AuditActorKind = "system" | "user" | "service";

export interface AuditActor {
    kind: AuditActorKind;
    id?: string;

    // Optional tenancy identifiers (fill if/when you have them)
    realmKey?: string;
    tenantKey?: string;
    orgKey?: string;
}

export interface AuditEvent {
    ts: string; // ISO timestamp
    type: string; // e.g. "module.loaded"
    level: AuditLevel;

    actor: AuditActor;

    // Optional extras
    requestId?: string;
    message?: string;
    meta?: Record<string, unknown>;
}

export interface AuditWriter {
    write(event: AuditEvent): void | Promise<void>;
    flush?(): Promise<void>;
}

/**
 * Default audit writer for development / bootstrap.
 * Keeps kernel decoupled from any structured logging library.
 */
export function createConsoleAuditWriter(): AuditWriter {
    return {
        write(event: AuditEvent) {
            // Keep it simple and safe: meta is already unknown-typed
            // eslint-disable-next-line no-console
            console.log(`[audit] ${event.ts} ${event.level} ${event.type}`, {
                actor: event.actor,
                requestId: event.requestId,
                message: event.message,
                meta: event.meta,
            });
        },
    };
}

export function createNoopAuditWriter(): AuditWriter {
    return {
        write(_event: AuditEvent) {
            // intentionally noop
        },
        async flush() {
            // noop
        },
    };
}

/**
 * Helper to create an AuditEvent with the current timestamp.
 * Simplifies audit event creation by auto-adding the timestamp.
 */
export function makeAuditEvent(data: {
    type: string;
    level: AuditLevel;
    actor: AuditActor;
    requestId?: string;
    message?: string;
    meta?: Record<string, unknown>;
}): AuditEvent {
    return {
        ts: new Date().toISOString(),
        type: data.type,
        level: data.level,
        actor: data.actor,
        requestId: data.requestId,
        message: data.message,
        meta: data.meta,
    };
}