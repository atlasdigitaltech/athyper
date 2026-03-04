/**
 * DocBrandService — CRUD and resolution for brand profiles.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type {
  DocBrandProfileRepo,
  CreateBrandProfileInput,
  UpdateBrandProfileInput,
} from "../../persistence/DocBrandProfileRepo.js";
import type { DocBrandProfile } from "../models/DocBrandProfile.js";
import type { BrandProfileId } from "../types.js";

export class DocBrandService {
  constructor(
    private readonly repo: DocBrandProfileRepo,
    private readonly logger: Logger,
  ) {}

  async create(
    tenantId: string,
    data: Omit<CreateBrandProfileInput, "tenantId">,
  ): Promise<DocBrandProfile> {
    const existing = await this.repo.getByCode(tenantId, data.code);
    if (existing) {
      throw new Error(
        `Brand profile with code '${data.code}' already exists for this tenant`,
      );
    }

    const profile = await this.repo.create({ tenantId, ...data });
    this.logger.info(
      { brandProfileId: profile.id, code: profile.code },
      "[doc:brand] Created",
    );
    return profile;
  }

  async getById(id: BrandProfileId): Promise<DocBrandProfile | undefined> {
    return this.repo.getById(id);
  }

  async list(tenantId: string): Promise<DocBrandProfile[]> {
    return this.repo.list(tenantId);
  }

  async update(
    id: BrandProfileId,
    data: UpdateBrandProfileInput,
  ): Promise<void> {
    await this.repo.update(id, data);
    this.logger.info({ brandProfileId: id }, "[doc:brand] Updated");
  }

  async resolveDefault(tenantId: string): Promise<DocBrandProfile | undefined> {
    return this.repo.getDefault(tenantId);
  }
}
