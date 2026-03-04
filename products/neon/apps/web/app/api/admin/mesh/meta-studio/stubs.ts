import "server-only";

import type {
    EntitySummary,
    FieldDefinition,
    RelationDefinition,
    VersionSummary,
} from "@/lib/schema-manager/types";

// ─── Stub Configuration ──────────────────────────────────────

export function isStubEnabled(): boolean {
    return (
        process.env.ENABLE_DEV_STUBS === "true" &&
        process.env.NODE_ENV !== "production"
    );
}

// ─── Version Templates ───────────────────────────────────────

const DRAFT_VERSION: VersionSummary = {
    id: "v-stub-draft",
    versionNo: 1,
    status: "draft",
    label: "Initial draft",
    publishedAt: null,
    publishedBy: null,
    createdAt: "2026-01-15T10:00:00.000Z",
};

const PUBLISHED_VERSION: VersionSummary = {
    id: "v-stub-pub",
    versionNo: 1,
    status: "published",
    label: "v1.0",
    publishedAt: "2026-01-20T14:30:00.000Z",
    publishedBy: "admin",
    createdAt: "2026-01-15T10:00:00.000Z",
};

// ─── Entity Stubs ────────────────────────────────────────────

const STUB_ENTITIES: EntitySummary[] = [
    {
        id: "ent-stub-account",
        name: "account",
        kind: "ref",
        moduleId: null,
        tableSchema: "ref",
        tableName: "account",
        isActive: true,
        currentVersion: { ...PUBLISHED_VERSION, id: "v-account-001" },
        fieldCount: 8,
        relationCount: 2,
        updatedAt: "2026-02-10T09:15:00.000Z",
    },
    {
        id: "ent-stub-contact",
        name: "contact",
        kind: "ent",
        moduleId: null,
        tableSchema: "ent",
        tableName: "contact",
        isActive: true,
        currentVersion: { ...PUBLISHED_VERSION, id: "v-contact-001" },
        fieldCount: 12,
        relationCount: 3,
        updatedAt: "2026-02-08T16:45:00.000Z",
    },
    {
        id: "ent-stub-purchase-invoice",
        name: "purchase_invoice",
        kind: "doc",
        moduleId: null,
        tableSchema: "doc",
        tableName: "purchase_invoice",
        isActive: true,
        currentVersion: { ...DRAFT_VERSION, id: "v-pi-001" },
        fieldCount: 10,
        relationCount: 2,
        updatedAt: "2026-02-15T11:20:00.000Z",
    },
    {
        id: "ent-stub-product",
        name: "product",
        kind: "ref",
        moduleId: null,
        tableSchema: "ref",
        tableName: "product",
        isActive: true,
        currentVersion: { ...PUBLISHED_VERSION, id: "v-product-001" },
        fieldCount: 15,
        relationCount: 4,
        updatedAt: "2026-02-01T08:00:00.000Z",
    },
    {
        id: "ent-stub-sales-order",
        name: "sales_order",
        kind: "doc",
        moduleId: null,
        tableSchema: "doc",
        tableName: "sales_order",
        isActive: true,
        currentVersion: { ...DRAFT_VERSION, id: "v-so-001", versionNo: 2 },
        fieldCount: 14,
        relationCount: 5,
        updatedAt: "2026-02-14T17:30:00.000Z",
    },
    {
        id: "ent-stub-currency",
        name: "currency",
        kind: "ref",
        moduleId: null,
        tableSchema: "ref",
        tableName: "currency",
        isActive: true,
        currentVersion: { ...PUBLISHED_VERSION, id: "v-currency-001" },
        fieldCount: 4,
        relationCount: 0,
        updatedAt: "2026-01-10T12:00:00.000Z",
    },
    {
        id: "ent-stub-warehouse",
        name: "warehouse",
        kind: "ent",
        moduleId: null,
        tableSchema: "ent",
        tableName: "warehouse",
        isActive: false,
        currentVersion: null,
        fieldCount: 0,
        relationCount: 0,
        updatedAt: null,
    },
];

const ENTITY_BY_NAME = new Map(STUB_ENTITIES.map((e) => [e.name, e]));

// ─── Field Stubs ─────────────────────────────────────────────

function makeField(
    partial: Pick<FieldDefinition, "id" | "name" | "columnName" | "dataType"> &
        Partial<FieldDefinition>,
): FieldDefinition {
    return {
        uiType: null,
        isRequired: false,
        isUnique: false,
        isSearchable: false,
        isFilterable: false,
        defaultValue: null,
        validation: null,
        lookupConfig: null,
        sortOrder: 0,
        isActive: true,
        createdAt: "2026-01-15T10:00:00.000Z",
        updatedAt: null,
        ...partial,
    };
}

const STUB_FIELDS: Record<string, FieldDefinition[]> = {
    account: [
        makeField({ id: "f-acc-1", name: "account_code", columnName: "account_code", dataType: "string", isRequired: true, isUnique: true, isSearchable: true, isFilterable: true, sortOrder: 1 }),
        makeField({ id: "f-acc-2", name: "account_name", columnName: "account_name", dataType: "string", isRequired: true, isSearchable: true, sortOrder: 2 }),
        makeField({ id: "f-acc-3", name: "account_type", columnName: "account_type", dataType: "enum", isRequired: true, isFilterable: true, sortOrder: 3 }),
        makeField({ id: "f-acc-4", name: "currency", columnName: "currency", dataType: "string", isRequired: true, sortOrder: 4 }),
        makeField({ id: "f-acc-5", name: "parent_account", columnName: "parent_account", dataType: "reference", sortOrder: 5 }),
        makeField({ id: "f-acc-6", name: "status", columnName: "status", dataType: "enum", isRequired: true, isFilterable: true, sortOrder: 6 }),
        makeField({ id: "f-acc-7", name: "description", columnName: "description", dataType: "text", sortOrder: 7 }),
        makeField({ id: "f-acc-8", name: "opening_balance", columnName: "opening_balance", dataType: "decimal", sortOrder: 8 }),
    ],
    contact: [
        makeField({ id: "f-con-1", name: "first_name", columnName: "first_name", dataType: "string", isRequired: true, isSearchable: true, sortOrder: 1 }),
        makeField({ id: "f-con-2", name: "last_name", columnName: "last_name", dataType: "string", isRequired: true, isSearchable: true, sortOrder: 2 }),
        makeField({ id: "f-con-3", name: "email", columnName: "email", dataType: "string", isUnique: true, isSearchable: true, sortOrder: 3 }),
        makeField({ id: "f-con-4", name: "phone", columnName: "phone", dataType: "string", sortOrder: 4 }),
        makeField({ id: "f-con-5", name: "company", columnName: "company", dataType: "string", isFilterable: true, sortOrder: 5 }),
    ],
};

// ─── Relation Stubs ──────────────────────────────────────────

const STUB_RELATIONS: Record<string, RelationDefinition[]> = {
    account: [
        { id: "r-acc-1", name: "parent", relationKind: "belongs_to", targetEntity: "account", fkField: "parent_account", targetKey: "id", onDelete: "restrict", uiBehavior: null, createdAt: "2026-01-15T10:00:00.000Z" },
        { id: "r-acc-2", name: "invoices", relationKind: "has_many", targetEntity: "purchase_invoice", fkField: null, targetKey: "account_id", onDelete: "restrict", uiBehavior: null, createdAt: "2026-01-15T10:00:00.000Z" },
    ],
    contact: [
        { id: "r-con-1", name: "account", relationKind: "belongs_to", targetEntity: "account", fkField: "account_id", targetKey: "id", onDelete: "restrict", uiBehavior: null, createdAt: "2026-01-15T10:00:00.000Z" },
    ],
};

// ─── Stub Router ─────────────────────────────────────────────

/**
 * Resolves a stub response for a given upstream API path.
 * Returns null if no stub is available for the path.
 */
export function resolveStub(path: string): unknown | null {
    // GET /api/meta/entities
    if (path === "/api/meta/entities") {
        return STUB_ENTITIES;
    }

    // Parse /api/meta/entities/:entity[/:sub]
    const match = path.match(/^\/api\/meta\/entities\/([^/]+)(?:\/(.+))?$/);
    if (!match) return null;

    const entityName = decodeURIComponent(match[1]);
    const sub = match[2] ?? null;
    const entity = ENTITY_BY_NAME.get(entityName);

    // GET /api/meta/entities/:entity
    if (!sub) {
        return entity ?? null;
    }

    // Sub-resource stubs
    switch (sub) {
        case "fields":
            return STUB_FIELDS[entityName] ?? [];
        case "relations":
            return STUB_RELATIONS[entityName] ?? [];
        case "indexes":
            return [];
        case "policies":
            return {
                entityPolicy: {
                    id: "pol-stub-001",
                    accessMode: "rbac",
                    ouScopeMode: "tenant",
                    auditMode: "full",
                    retentionPolicy: null,
                    defaultFilters: null,
                    cacheFlags: null,
                    createdAt: "2026-01-15T10:00:00.000Z",
                },
                fieldSecurityPolicies: [],
            };
        case "overlays":
            return [];
        case "versions":
            return entity?.currentVersion ? [entity.currentVersion] : [];
        case "compiled":
            return entity
                ? {
                      id: `compiled-${entity.id}`,
                      entityVersionId: entity.currentVersion?.id ?? "unknown",
                      compiledJson: { entity: entityName, fields: STUB_FIELDS[entityName]?.length ?? 0 },
                      compiledHash: "stub-hash-" + entityName,
                      generatedAt: new Date().toISOString(),
                  }
                : null;
        case "lifecycle":
            return { states: [], transitions: [] };
        case "validation":
            return { version: 1, rules: [] };
        case "diff":
            return { changes: [] };
        default:
            return null;
    }
}
