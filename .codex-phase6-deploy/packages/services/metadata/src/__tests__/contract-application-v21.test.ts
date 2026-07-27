import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  canonicalizeMetaEntityContractV21,
  type MetaEntityContractV21,
} from "@athyper/api-contracts/meta-entity-contract-v21";

import {
  ContractApplicationError,
  ContractApplicationService,
  type ContractApplicationRepository,
  type ContractApplicationTransaction,
  type ContractProjectionPlan,
  type ContractVersionState,
  type ResolvedContractReferences,
} from "../contract-application/contract-application.service.js";

const uuid = (value: number) => `00000000-0000-5000-8000-${value.toString().padStart(12, "0")}`;

function contract(): MetaEntityContractV21 {
  const idField = uuid(1);
  const statusField = uuid(2);
  const numberField = uuid(3);
  const submitOperation = "entity.submit";
  return {
    contract_schema_version: "2.1",
    catalog: {
      module_code: "platform",
      entity_code: "sample_entity",
      slug: "sample-entity",
      entity_class: "reference",
      profile_code: null,
      ownership_model: "system",
      labels: { singular: "Sample", plural: "Samples", description: null },
      presentation: { icon_key: null, color_token: null },
      plane_eligibility: ["neon", "admin"],
      enabled: true,
    },
    runtime: {
      catalog_enabled: true,
      runtime_enabled: true,
      api_exposure: "API",
      storage: {
        backing_type: "table",
        table_schema: "master",
        table_name: "sample_entity",
        key_strategy: "single",
        primary_key: "id",
        tenant_column: "tenant_id",
      },
      capabilities: {
        read: "generic",
        write: "generic",
        read_handler: null,
        write_handler: null,
      },
      create_mode: "FORM_ONLY",
      draft_ttl_hours: null,
      governance_level: "full",
      security_tier: "config",
      mutability: "controlled",
      identity: {
        primary_key_field: "id",
        business_key_fields: ["code"],
        natural_key_fields: ["code"],
        display_identity: { title_field: "code", subtitle_field: null },
        parent: null,
        identity_via: null,
        list_entity_code: null,
        duplicate_check: { enabled: false, fields: [], scope: "tenant" },
        replacement: null,
      },
      search: {
        enabled: true,
        mode: "server",
        fields: [{ field: "code", weight: 10 }],
        minimum_query_length: 1,
        operator: "contains",
      },
      data_policy: {
        classification: "internal",
        retention: { days: null, legal_hold_eligible: false },
        deletion: { anonymize: false },
        pii_fields: [],
      },
      concurrency: {
        strategy: "version",
        rollout: "enforced",
        row_version_field: null,
        lock_required: false,
      },
      storage_config: {},
    },
    fields: [
      {
        id: idField, name: "id", column_name: "id", projection_alias_of: null,
        label: "ID", description: null, data_type: "uuid", cardinality: "one",
        origin: "system", required: true, unique: true, unique_scope: "global",
        read_only: true, deprecated: false, computed: false, write_once: true,
        runtime_enabled: true, compute: null, defaults: null,
        capabilities: { filterable: true, sortable: true, groupable: false, aggregatable: false },
        semantic_roles: ["identity.primary"], type_config: { kind: "scalar", format: null, unit: null },
      },
      {
        id: statusField, name: "status", column_name: "status", projection_alias_of: null,
        label: "Status", description: null, data_type: "text", cardinality: "one",
        origin: "system", required: true, unique: false, unique_scope: null,
        read_only: true, deprecated: false, computed: false, write_once: false,
        runtime_enabled: true, compute: null, defaults: null,
        capabilities: { filterable: true, sortable: true, groupable: true, aggregatable: false },
        semantic_roles: ["lifecycle.status"], type_config: { kind: "scalar", format: null, unit: null },
      },
      {
        id: numberField, name: "code", column_name: "code", projection_alias_of: null,
        label: "Code", description: null, data_type: "text", cardinality: "one",
        origin: "standard", required: true, unique: true, unique_scope: "tenant",
        read_only: true, deprecated: false, computed: false, write_once: true,
        runtime_enabled: true, compute: null, defaults: null,
        capabilities: { filterable: true, sortable: true, groupable: true, aggregatable: false },
        semantic_roles: ["identity.business"], type_config: { kind: "scalar", format: null, unit: null },
      },
    ],
    relations: [],
    surfaces: [{
      id: uuid(10), surface_key: "main", mode: "create", kind: "FORM",
      placement: "main", parent_surface_id: null, slot_key: null,
      renderer: { key: "form", composer_key: null, strategy_key: null, config: {} },
      layout: { column_count: 2, print_span: null, density: "comfortable" },
      security: { required_permissions: ["sample.read"], visibility_condition: null },
      grouping: { group_codes: [], relation_code: null },
      label: "Sample", order: 10, enabled: true,
      bindings: [{
        id: uuid(11), field_id: numberField, visible: true, required: true,
        read_only: null, order: 10, column_span: 6, density: null, group_code: null,
        renderer_key: null, editor_key: null, visibility_condition: null,
        editability_condition: null, renderer_config: {},
      }],
    }],
    operations: [{
      id: uuid(20), operation_code: submitOperation, permission_code: "sample.submit",
      surface: "BOTH", placement: "PRIMARY", plane_filter: ["neon", "admin"],
      handler: { kind: "api", target: "flow:default_flow" },
      execution: { target: "lifecycle:submit", timeout_ms: null, idempotency_required: true },
      record_required: true, label: "Submit", icon: null, intent: "success",
      confirmation: { required: false, code: null, message: null },
      reason_required: false, selection: null, order: 10, enabled: true,
      action_rules: [{
        id: uuid(21), status: "draft", action_code: "HEADER.SUBMIT",
        capability: "requires_permission", required_permission: "sample.submit",
        reason: null, condition: null, metadata: {},
      }],
    }],
    numbering: {
      configurations: [
        {
          id: uuid(30), code: "tenant_code", company_scope: { mode: "all", company_code: null },
          field_scope: { field_name: "code", uniqueness: "tenant" }, reset_policy: "yearly",
          segments: [
            { kind: "calendar_year", value: null, width: 4 },
            { kind: "sequence", value: null, width: 6 },
          ],
          confirmation: { required: false, message: null },
          format: { prefix: "TEN", prefix_configurable: false, separator: "-", max_length: 32, allowed_chars: "upper_alnum_dash" },
          enabled: true, metadata: {},
        },
        {
          id: uuid(31), code: "company_code", company_scope: { mode: "company", company_code: "athq" },
          field_scope: { field_name: "code", uniqueness: "company" }, reset_policy: "fiscal_yearly",
          segments: [
            { kind: "company_code", value: null, width: null },
            { kind: "sequence", value: null, width: 5 },
          ],
          confirmation: { required: true, message: "Generate company number?" },
          format: { prefix: "", prefix_configurable: true, separator: "-", max_length: 32, allowed_chars: "upper_alnum_dash" },
          enabled: true, metadata: {},
        },
      ],
    },
    lifecycle: {
      binding: {
        id: uuid(40), code: "sample_lifecycle", status_field: "status",
        definition: { kind: "owned", id: uuid(41), version: 1 },
        condition: null, priority: 100,
      },
      states: [
        {
          id: uuid(42), code: "draft", label: "Draft", initial: true, terminal: false,
          presentation: { badge: null, icon: null, color: null },
          capabilities: { edit: true, delete: true, reversible: false, transition_to: ["active"] },
          masks: [{
            id: uuid(43), planes: ["neon", "admin"], edit: true, delete: true,
            transition_to: ["active"], disabled_reason: null,
          }],
        },
        {
          id: uuid(44), code: "active", label: "Active", initial: false, terminal: true,
          presentation: { badge: null, icon: null, color: null },
          capabilities: { edit: false, delete: false, reversible: false, transition_to: [] },
          masks: [{
            id: uuid(45), planes: ["neon", "admin"], edit: false, delete: false,
            transition_to: [], disabled_reason: "lifecycle_locked",
          }],
        },
      ],
      transitions: [{
        id: uuid(46), from: "draft", to: "active", operation_code: submitOperation,
        conditions: [], gates: [], hooks: [], timers: [],
      }],
      command_handler: "lifecycle.command",
    },
    flows: [{
      id: uuid(50), flow_code: "default_flow", label: "Create sample",
      description: null, icon_key: null, trigger_context: "new", default: true,
      version: 1, condition: null, required_permissions: ["sample.submit"],
      writer_operation: submitOperation, submit_operation: submitOperation, config: {},
      steps: [{
        id: uuid(51), step_key: "details", label: "Details", description: null,
        icon_key: null, order: 10, skip_when: null, advance_rule: {},
        layout_hint: "two_column", required_permissions: [],
        sections: [{
          id: uuid(52), section_key: "identity", label: "Identity", description: null,
          order: 10, collapsed: false, visible_when: null,
          reveal_behavior: "honor_default", icon_key: null, help_text: null,
        }],
        fields: [{
          id: uuid(53), field_id: numberField, section_id: uuid(52), mode: "required",
          derivation: null, visible_when: null, required_when: null, summary_role: null,
          ui_variant: null, format: null, span: 1, help_text: null, placeholder: null,
          order: 10, metadata: {},
        }],
      }],
    }],
    policy: {
      merge_order: ["platform_baseline", "tenant_overlay", "field_security"],
      platform_baseline: {
        access_mode: "default_deny", company_scope_mode: "none", audit_mode: "enabled",
        retention: {}, filters: {}, cache_flags: {},
        cache_policy: {
          mode: "stale_while_revalidate",
          fresh_for_seconds: 30,
          retain_for_seconds: 300,
          prefetch: "intent",
          restore_scroll: true,
          invalidate_on_mutation: true,
          max_queries_per_entity: 5,
          max_rows_per_query: 200,
          storage: "memory",
          source: "platform",
        },
      },
      tenant_overlay: null,
      field_security: [],
    },
  };
}

class MemoryRepository implements ContractApplicationRepository {
  state: ContractVersionState = {
    versionId: uuid(100), entityCode: "sample_entity", tenantId: null,
    status: "DRAFT", contractSchemaVersion: null, contractHash: null,
    lockVersion: 0, submittedBy: null,
  };
  document: MetaEntityContractV21 | null = null;
  projectionApplications = 0;
  failProjection = false;
  failCompile = false;
  publishedArtifactPlanes: string[] = [];

  async transaction<T>(work: (transaction: ContractApplicationTransaction) => Promise<T>): Promise<T> {
    const snapshot = structuredClone({
      state: this.state,
      document: this.document,
      projectionApplications: this.projectionApplications,
      publishedArtifactPlanes: this.publishedArtifactPlanes,
    });
    try {
      return await work(this.transactionAdapter());
    } catch (error) {
      this.state = snapshot.state;
      this.document = snapshot.document;
      this.projectionApplications = snapshot.projectionApplications;
      this.publishedArtifactPlanes = snapshot.publishedArtifactPlanes;
      throw error;
    }
  }

  async readVersion(): Promise<ContractVersionState> {
    return this.state;
  }

  async exportCanonicalContract(): Promise<{
    contract: unknown;
    version: ContractVersionState;
  } | null> {
    return this.document ? { contract: this.document, version: this.state } : null;
  }

  private transactionAdapter(): ContractApplicationTransaction {
    return {
      readVersionForUpdate: async () => this.state,
      resolveReferences: async (): Promise<ResolvedContractReferences> => ({
        moduleId: uuid(200), entityId: uuid(201),
        companyCodeIds: new Map([["athq", uuid(202)]]),
        permissionCodes: new Set(["sample.read", "sample.submit"]),
        handlerTargets: new Set(["api:flow:default_flow", "lifecycle:submit"]),
        targetEntityIds: new Map(),
      }),
      validateProjection: async () => [],
      applyProjection: async (_plan: ContractProjectionPlan) => {
        this.projectionApplications += 1;
        if (this.failProjection) throw new Error("invalid owner");
      },
      persistCanonicalDocument: async (_id, value, hash, expectedLock) => {
        expect(expectedLock).toBe(this.state.lockVersion);
        this.document = value;
        this.state = {
          ...this.state,
          contractSchemaVersion: "2.1",
          contractHash: hash,
          lockVersion: this.state.lockVersion + 1,
        };
        return this.state.lockVersion;
      },
      readCanonicalContractForUpdate: async () => this.document,
      readCurrentPublishedContract: async () => null,
      compileVersion: async () => {
        if (this.failCompile) throw new Error("compile failed");
        return {
          entity_code: "sample_entity",
          version_id: this.state.versionId,
        };
      },
      submit: async () => {
        this.state = { ...this.state, status: "IN_REVIEW", submittedBy: uuid(300) };
      },
      reject: async () => {
        this.state = { ...this.state, status: "REJECTED" };
      },
      createDraft: async () => this.state,
      publish: async (input) => {
        this.publishedArtifactPlanes = input.artifacts.map((artifact) => artifact.plane);
        this.state = { ...this.state, status: "EFFECTIVE" };
      },
      isPublishedReady: async () => this.state.status === "EFFECTIVE",
      createRollbackVersion: async () => this.state,
    };
  }
}

describe("Contract v2.1 application service", () => {
  it("canonicalizes before hashing and round-trips multiple numbering configurations", async () => {
    const repository = new MemoryRepository();
    const service = new ContractApplicationService(repository);
    const source = contract();
    source.fields.reverse();
    source.catalog.plane_eligibility.reverse();

    const applied = await service.execute({
      mode: "apply-to-draft",
      versionId: repository.state.versionId,
      actorId: uuid(300),
      contract: source,
      ifMatch: "*",
      expectedLockVersion: 0,
    });
    const exported = await service.execute({
      mode: "export",
      versionId: repository.state.versionId,
    });

    expect(applied.valid).toBe(true);
    expect(exported.contractHash).toBe(applied.contractHash);
    expect(exported.contract?.numbering.configurations).toHaveLength(2);
    expect(canonicalizeMetaEntityContractV21(exported.contract)).toEqual(exported.contract);
  });

  it("treats the same canonical hash as a no-op", async () => {
    const repository = new MemoryRepository();
    const service = new ContractApplicationService(repository);
    const first = await service.execute({
      mode: "apply-to-draft", versionId: repository.state.versionId,
      actorId: uuid(300), contract: contract(), ifMatch: "*", expectedLockVersion: 0,
    });
    const second = await service.execute({
      mode: "apply-to-draft", versionId: repository.state.versionId,
      actorId: uuid(300), contract: contract(), ifMatch: `"${first.contractHash}"`,
      expectedLockVersion: 1,
    });

    expect(second.noOp).toBe(true);
    expect(repository.projectionApplications).toBe(1);
    expect(repository.state.lockVersion).toBe(1);
  });

  it("patches only JSON Pointer paths inside the selected owner", async () => {
    const repository = new MemoryRepository();
    const service = new ContractApplicationService(repository);
    const first = await service.execute({
      mode: "apply-to-draft",
      versionId: repository.state.versionId,
      actorId: uuid(300),
      contract: contract(),
      ifMatch: "*",
      expectedLockVersion: 0,
    });
    const patched = await service.execute({
      mode: "patch-owner",
      versionId: repository.state.versionId,
      actorId: uuid(300),
      owner: "catalog",
      value: { patch: [{ path: "/labels/singular", value: "Updated sample" }] },
      ifMatch: `"${first.contractHash}"`,
      expectedLockVersion: 1,
      requestKey: "catalog-label",
    });

    expect(patched.contract?.catalog.labels.singular).toBe("Updated sample");
    expect(patched.contract?.catalog.entity_code).toBe("sample_entity");
    expect(patched.contractHash).not.toBe(first.contractHash);
    expect(repository.state.lockVersion).toBe(2);
  });

  it("returns the current document and changed paths when an owner patch is stale", async () => {
    const repository = new MemoryRepository();
    const service = new ContractApplicationService(repository);
    const baseDocument = contract();
    const first = await service.execute({
      mode: "apply-to-draft",
      versionId: repository.state.versionId,
      actorId: uuid(300),
      contract: baseDocument,
      ifMatch: "*",
      expectedLockVersion: 0,
    });
    await service.execute({
      mode: "patch-owner",
      versionId: repository.state.versionId,
      actorId: uuid(301),
      owner: "catalog",
      value: { ...baseDocument.catalog, labels: { ...baseDocument.catalog.labels, singular: "Remote label" } },
      ifMatch: `"${first.contractHash}"`,
      expectedLockVersion: 1,
    });

    const error = await service.execute({
      mode: "patch-owner",
      versionId: repository.state.versionId,
      actorId: uuid(300),
      owner: "policy",
      value: baseDocument.policy,
      baseContract: baseDocument,
      ifMatch: `"${first.contractHash}"`,
      expectedLockVersion: 1,
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ContractApplicationError);
    expect((error as ContractApplicationError).status).toBe(409);
    expect((error as ContractApplicationError).details).toMatchObject({
      currentLockVersion: 2,
      changedPaths: ["/catalog/labels/singular"],
    });
    expect((error as ContractApplicationError).details?.["currentDocument"]).toBeTruthy();
  });

  it("rolls back canonical persistence when any owner projection fails", async () => {
    const repository = new MemoryRepository();
    repository.failProjection = true;
    const service = new ContractApplicationService(repository);

    await expect(service.execute({
      mode: "apply-to-draft", versionId: repository.state.versionId,
      actorId: uuid(300), contract: contract(), ifMatch: "*", expectedLockVersion: 0,
    })).rejects.toThrow("invalid owner");
    expect(repository.document).toBeNull();
    expect(repository.projectionApplications).toBe(0);
    expect(repository.state.lockVersion).toBe(0);
  });

  it("validates executable flow references, lifecycle masks, and action rules", async () => {
    const service = new ContractApplicationService(new MemoryRepository());
    const valid = await service.execute({ mode: "validate", contract: contract() });
    expect(valid.valid).toBe(true);
    expect(valid.plan).toBeUndefined();

    const invalid = contract();
    invalid.flows[0]!.writer_operation = "missing.operation";
    const result = await service.execute({ mode: "validate", contract: invalid });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((item) => item.path.includes("writer_operation"))).toBe(true);
  });

  it("keeps every GET contract endpoint free of materialization writes", () => {
    const route = readFileSync(fileURLToPath(new URL(
      "../../routes/studio-contract-v21.route.ts",
      import.meta.url,
    )), "utf8");
    const service = readFileSync(fileURLToPath(new URL(
      "../contract-application/contract-application.service.ts",
      import.meta.url,
    )), "utf8");
    expect(route).toContain('mode: "export"');
    expect(service).toContain("exportCanonicalContract");
    expect(service).not.toContain("materializeDraftContract");
  });

  it("version-scopes relational owner ids and never writes numbering counters", () => {
    const projector = readFileSync(fileURLToPath(new URL(
      "../contract-application/postgres-contract-application.repository.ts",
      import.meta.url,
    )), "utf8");
    expect(projector).toContain("function projectionId(versionId: string, artifactOwnerId: string)");
    expect(projector).toContain("projectionId(versionId, field.id)");
    expect(projector).toContain("projectionId(plan.versionId, flow.id)");
    expect(projector).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+control\.entity_numbering_counter/i,
    );
  });

  it("leaves the published version untouched when transactional compilation fails", async () => {
    const repository = new MemoryRepository();
    const service = new ContractApplicationService(repository);
    const applied = await service.execute({
      mode: "apply-to-draft",
      versionId: repository.state.versionId,
      actorId: uuid(300),
      contract: contract(),
      ifMatch: "*",
      expectedLockVersion: 0,
    });
    repository.state = {
      ...repository.state,
      status: "IN_REVIEW",
      submittedBy: uuid(301),
    };
    repository.failCompile = true;
    const applicationsBefore = repository.projectionApplications;

    await expect(service.execute({
      mode: "publish",
      versionId: repository.state.versionId,
      actorId: uuid(302),
      ifMatch: `"${applied.contractHash}"`,
      expectedLockVersion: 1,
      requestKey: "publish-fails",
    })).rejects.toThrow("compile failed");

    expect(repository.state.status).toBe("IN_REVIEW");
    expect(repository.projectionApplications).toBe(applicationsBefore);
    expect(repository.publishedArtifactPlanes).toEqual([]);
  });

  it("publishes all three immutable plane artifacts and makes retries no-ops", async () => {
    const repository = new MemoryRepository();
    const service = new ContractApplicationService(repository);
    const applied = await service.execute({
      mode: "apply-to-draft",
      versionId: repository.state.versionId,
      actorId: uuid(300),
      contract: contract(),
      ifMatch: "*",
      expectedLockVersion: 0,
    });
    repository.state = {
      ...repository.state,
      status: "IN_REVIEW",
      submittedBy: uuid(301),
    };
    const request = {
      mode: "publish" as const,
      versionId: repository.state.versionId,
      actorId: uuid(302),
      ifMatch: `"${applied.contractHash}"`,
      expectedLockVersion: 1,
      requestKey: "publish-once",
    };
    const published = await service.execute(request);
    const replay = await service.execute(request);

    expect(published.versionStatus).toBe("EFFECTIVE");
    expect(repository.publishedArtifactPlanes).toEqual(["admin", "neon", "mesh"]);
    expect(published.artifacts?.map((artifact) => artifact.plane)).toEqual(["admin", "neon", "mesh"]);
    expect(replay.noOp).toBe(true);
  });
});
