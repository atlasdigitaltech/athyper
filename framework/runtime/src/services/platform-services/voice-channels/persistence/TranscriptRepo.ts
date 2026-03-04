/**
 * Persistence — CRUD for collab.call_transcript.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "collab.call_transcript" as keyof DB & string;

// ── Types ────────────────────────────────────────────────────────────

export interface TranscriptSegment {
    startMs: number;
    endMs: number;
    speaker: string;
    text: string;
    confidence?: number;
}

export interface CallTranscript {
    id: string;
    tenantId: string;
    sessionId: string;
    transcriptText: string;
    confidence: number | null;
    language: string;
    segments: TranscriptSegment[] | null;
    createdAt: Date;
}

export interface CreateTranscriptInput {
    tenantId: string;
    sessionId: string;
    transcriptText: string;
    confidence?: number;
    language?: string;
    segments?: TranscriptSegment[];
}

// ── Repository ───────────────────────────────────────────────────────

export class TranscriptRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getBySession(tenantId: string, sessionId: string): Promise<CallTranscript | undefined> {
        const row = await (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("session_id", "=", sessionId)
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    async create(input: CreateTranscriptInput): Promise<CallTranscript> {
        const row = await (this.db as any)
            .insertInto(TABLE)
            .values({
                tenant_id: input.tenantId,
                session_id: input.sessionId,
                transcript_text: input.transcriptText,
                confidence: input.confidence ?? null,
                language: input.language ?? "en",
                segments: input.segments ? JSON.stringify(input.segments) : null,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return this.mapRow(row);
    }

    private mapRow(row: any): CallTranscript {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            sessionId: row.session_id,
            transcriptText: row.transcript_text,
            confidence: row.confidence ?? null,
            language: row.language ?? "en",
            segments: this.parseJson(row.segments) as TranscriptSegment[] | null,
            createdAt: new Date(row.created_at),
        };
    }

    private parseJson(value: unknown): unknown | null {
        if (value == null) return null;
        if (typeof value === "object") return value;
        if (typeof value === "string") {
            try { return JSON.parse(value); } catch { return null; }
        }
        return null;
    }
}
