/**
 * Test Case Repository
 *
 * C: Testcase Model + Storage
 * - PolicyTestCase definition
 * - Store per-tenant (meta schema)
 * - CRUD operations
 * - Run result tracking
 */

import type {
  ITestCaseRepository,
  PolicyTestCase,
  StoredTestCase,
  TestCaseRunResult,
} from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// In-Memory Test Case Repository (for testing/development)
// ============================================================================

/**
 * In-memory test case repository
 *
 * For development and testing. Production should use database implementation.
 */
export class InMemoryTestCaseRepository implements ITestCaseRepository {
  private testCases: Map<string, StoredTestCase> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter++;
    return `tc-${Date.now()}-${this.idCounter}`;
  }

  private makeKey(tenantId: string, testCaseId: string): string {
    return `${tenantId}:${testCaseId}`;
  }

  async getById(tenantId: string, testCaseId: string): Promise<StoredTestCase | undefined> {
    return this.testCases.get(this.makeKey(tenantId, testCaseId));
  }

  async list(
    tenantId: string,
    options?: {
      policyId?: string;
      tags?: string[];
      enabled?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<StoredTestCase[]> {
    let results = Array.from(this.testCases.values()).filter(
      (tc) => tc.tenantId === tenantId
    );

    if (options?.policyId) {
      results = results.filter((tc) => tc.policyId === options.policyId);
    }

    if (options?.tags && options.tags.length > 0) {
      results = results.filter((tc) =>
        options.tags!.some((tag) => tc.tags.includes(tag))
      );
    }

    if (options?.enabled !== undefined) {
      results = results.filter((tc) => tc.enabled === options.enabled);
    }

    // Sort by name
    results.sort((a, b) => a.name.localeCompare(b.name));

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async create(
    tenantId: string,
    testCase: Omit<PolicyTestCase, "id" | "createdAt">,
    createdBy: string
  ): Promise<StoredTestCase> {
    const id = this.generateId();
    const now = new Date();

    const stored: StoredTestCase = {
      ...testCase,
      id,
      tenantId,
      createdAt: now,
      createdBy,
      enabled: testCase.enabled ?? true,
      tags: testCase.tags ?? [],
    };

    this.testCases.set(this.makeKey(tenantId, id), stored);
    return stored;
  }

  async update(
    tenantId: string,
    testCaseId: string,
    updates: Partial<PolicyTestCase>,
    updatedBy: string
  ): Promise<StoredTestCase> {
    const key = this.makeKey(tenantId, testCaseId);
    const existing = this.testCases.get(key);

    if (!existing) {
      throw new Error(`Test case not found: ${testCaseId}`);
    }

    const updated: StoredTestCase = {
      ...existing,
      ...updates,
      id: testCaseId, // Cannot change ID
      tenantId, // Cannot change tenant
      createdAt: existing.createdAt, // Cannot change creation time
      createdBy: existing.createdBy, // Cannot change creator
      updatedAt: new Date(),
      updatedBy,
    };

    this.testCases.set(key, updated);
    return updated;
  }

  async delete(tenantId: string, testCaseId: string): Promise<void> {
    const key = this.makeKey(tenantId, testCaseId);
    this.testCases.delete(key);
  }

  async updateRunResult(
    tenantId: string,
    testCaseId: string,
    result: TestCaseRunResult
  ): Promise<void> {
    const key = this.makeKey(tenantId, testCaseId);
    const existing = this.testCases.get(key);

    if (!existing) {
      return; // Silently skip if not found
    }

    const updated: StoredTestCase = {
      ...existing,
      lastRunAt: result.runAt,
      lastRunResult: result.passed ? "passed" : result.simulatorResult.success ? "failed" : "error",
      lastRunDurationMs: result.durationMs,
      lastRunError: result.failureReason,
    };

    this.testCases.set(key, updated);
  }

  async getByPolicy(tenantId: string, policyId: string): Promise<StoredTestCase[]> {
    return this.list(tenantId, { policyId });
  }

  async getByTags(tenantId: string, tags: string[]): Promise<StoredTestCase[]> {
    return this.list(tenantId, { tags });
  }

  // Utility methods for testing
  clear(): void {
    this.testCases.clear();
    this.idCounter = 0;
  }

  count(): number {
    return this.testCases.size;
  }
}

// ============================================================================
// Database Test Case Repository
// ============================================================================

/**
 * Database-backed test case repository
 *
 * Stores test cases in meta.policy_testcase table
 */
export class DatabaseTestCaseRepository implements ITestCaseRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(tenantId: string, testCaseId: string): Promise<StoredTestCase | undefined> {
    const result = await this.db
      .selectFrom("meta.policy_testcase" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", testCaseId)
      .executeTakeFirst();

    if (!result) return undefined;

    return this.mapRowToTestCase(result);
  }

  async list(
    tenantId: string,
    options?: {
      policyId?: string;
      tags?: string[];
      enabled?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<StoredTestCase[]> {
    let query = this.db
      .selectFrom("meta.policy_testcase" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (options?.policyId) {
      query = query.where("policy_id", "=", options.policyId);
    }

    if (options?.enabled !== undefined) {
      query = query.where("is_enabled", "=", options.enabled);
    }

    // Note: Tag filtering would require JSON array contains or separate tags table
    // For now, we filter in application code

    const results = await query
      .orderBy("name", "asc")
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0)
      .execute();

    let testCases = results.map((r: any) => this.mapRowToTestCase(r));

    // Apply tag filter in application
    if (options?.tags && options.tags.length > 0) {
      testCases = testCases.filter((tc) =>
        options.tags!.some((tag) => tc.tags.includes(tag))
      );
    }

    return testCases;
  }

  async create(
    tenantId: string,
    testCase: Omit<PolicyTestCase, "id" | "createdAt">,
    createdBy: string
  ): Promise<StoredTestCase> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto("meta.policy_testcase" as any)
      .values({
        id,
        tenant_id: tenantId,
        name: testCase.name,
        description: testCase.description,
        policy_id: testCase.policyId,
        input: JSON.stringify(testCase.input),
        expected: JSON.stringify(testCase.expected),
        assertions: testCase.assertions ? JSON.stringify(testCase.assertions) : null,
        tags: JSON.stringify(testCase.tags ?? []),
        is_enabled: testCase.enabled ?? true,
        created_at: now,
        created_by: createdBy,
      })
      .execute();

    return {
      ...testCase,
      id,
      tenantId,
      createdAt: now,
      createdBy,
      enabled: testCase.enabled ?? true,
      tags: testCase.tags ?? [],
    };
  }

  async update(
    tenantId: string,
    testCaseId: string,
    updates: Partial<PolicyTestCase>,
    updatedBy: string
  ): Promise<StoredTestCase> {
    const now = new Date();
    const updateData: Record<string, unknown> = {
      updated_at: now,
      updated_by: updatedBy,
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.policyId !== undefined) updateData.policy_id = updates.policyId;
    if (updates.input !== undefined) updateData.input = JSON.stringify(updates.input);
    if (updates.expected !== undefined) updateData.expected = JSON.stringify(updates.expected);
    if (updates.assertions !== undefined) updateData.assertions = JSON.stringify(updates.assertions);
    if (updates.tags !== undefined) updateData.tags = JSON.stringify(updates.tags);
    if (updates.enabled !== undefined) updateData.is_enabled = updates.enabled;

    await this.db
      .updateTable("meta.policy_testcase" as any)
      .set(updateData)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", testCaseId)
      .execute();

    const result = await this.getById(tenantId, testCaseId);
    if (!result) {
      throw new Error(`Test case not found after update: ${testCaseId}`);
    }

    return result;
  }

  async delete(tenantId: string, testCaseId: string): Promise<void> {
    await this.db
      .deleteFrom("meta.policy_testcase" as any)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", testCaseId)
      .execute();
  }

  async updateRunResult(
    tenantId: string,
    testCaseId: string,
    result: TestCaseRunResult
  ): Promise<void> {
    await this.db
      .updateTable("meta.policy_testcase" as any)
      .set({
        last_run_at: result.runAt,
        last_run_result: result.passed ? "passed" : result.simulatorResult.success ? "failed" : "error",
        last_run_duration_ms: result.durationMs,
        last_run_error: result.failureReason,
      })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", testCaseId)
      .execute();
  }

  async getByPolicy(tenantId: string, policyId: string): Promise<StoredTestCase[]> {
    return this.list(tenantId, { policyId });
  }

  async getByTags(tenantId: string, tags: string[]): Promise<StoredTestCase[]> {
    return this.list(tenantId, { tags });
  }

  private mapRowToTestCase(row: any): StoredTestCase {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      policyId: row.policy_id,
      input: typeof row.input === "string" ? JSON.parse(row.input) : row.input,
      expected: typeof row.expected === "string" ? JSON.parse(row.expected) : row.expected,
      assertions: row.assertions
        ? typeof row.assertions === "string"
          ? JSON.parse(row.assertions)
          : row.assertions
        : undefined,
      tags: row.tags
        ? typeof row.tags === "string"
          ? JSON.parse(row.tags)
          : row.tags
        : [],
      enabled: row.is_enabled,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
      updatedBy: row.updated_by,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : undefined,
      lastRunResult: row.last_run_result,
      lastRunDurationMs: row.last_run_duration_ms,
      lastRunError: row.last_run_error,
    };
  }
}

/**
 * Create in-memory test case repository
 */
export function createInMemoryTestCaseRepository(): InMemoryTestCaseRepository {
  return new InMemoryTestCaseRepository();
}

/**
 * Create database test case repository
 */
export function createDatabaseTestCaseRepository(db: Kysely<DB>): DatabaseTestCaseRepository {
  return new DatabaseTestCaseRepository(db);
}
