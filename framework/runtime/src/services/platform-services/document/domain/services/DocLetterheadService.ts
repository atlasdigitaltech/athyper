/**
 * DocLetterheadService — CRUD and resolution for letterheads.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DocLetterheadRepo, CreateLetterheadInput, UpdateLetterheadInput } from "../../persistence/DocLetterheadRepo.js";
import type { DocLetterhead } from "../models/DocLetterhead.js";
import type { LetterheadId } from "../types.js";

export class DocLetterheadService {
    constructor(
        private readonly repo: DocLetterheadRepo,
        private readonly logger: Logger,
    ) {}

    async create(tenantId: string, data: Omit<CreateLetterheadInput, "tenantId">): Promise<DocLetterhead> {
        const existing = await this.repo.getByCode(tenantId, data.code);
        if (existing) {
            throw new Error(`Letterhead with code '${data.code}' already exists for this tenant`);
        }

        const letterhead = await this.repo.create({ tenantId, ...data });
        this.logger.info({ letterheadId: letterhead.id, code: letterhead.code }, "[doc:letterhead] Created");
        return letterhead;
    }

    async getById(id: LetterheadId): Promise<DocLetterhead | undefined> {
        return this.repo.getById(id);
    }

    async list(tenantId: string): Promise<DocLetterhead[]> {
        return this.repo.list(tenantId);
    }

    async update(id: LetterheadId, data: UpdateLetterheadInput): Promise<void> {
        await this.repo.update(id, data);
        this.logger.info({ letterheadId: id }, "[doc:letterhead] Updated");
    }

    async resolveDefault(tenantId: string, orgUnitId?: string): Promise<DocLetterhead | undefined> {
        return this.repo.getDefault(tenantId, orgUnitId);
    }
}
