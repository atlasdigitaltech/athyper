/**
 * Golden Test Packs
 *
 * E: Golden Test Packs
 * Default test scenarios:
 * - Role-based allow/deny
 * - OU/cost center scoped permissions
 * - Workflow state transition constraints
 * - Field masking obligations
 * - Time-based policies (business hours / blackout)
 * - Regression pack for CI
 */

import type {
  PolicyTestCase,
} from "./types.js";
import type { PolicyAction, PolicyContext, PolicyResource, PolicySubject } from "../evaluation/types.js";

// ============================================================================
// Test Subject Fixtures
// ============================================================================

/**
 * Admin user with full access
 */
export const ADMIN_SUBJECT: PolicySubject = {
  principalId: "admin-001",
  principalType: "user",
  roles: ["admin", "super_admin"],
  groups: ["administrators"],
  ouMembership: {
    nodeId: "ou-hq",
    path: "/root/hq",
    code: "hq",
    depth: 2,
  },
  attributes: {
    department: "it",
    level: "director",
    clearanceLevel: 5,
    employeeId: "EMP001",
  },
};

/**
 * Regular user with limited access
 */
export const REGULAR_USER_SUBJECT: PolicySubject = {
  principalId: "user-123",
  principalType: "user",
  roles: ["user", "editor"],
  groups: ["engineering", "team-alpha"],
  ouMembership: {
    nodeId: "ou-eng",
    path: "/root/hq/engineering/team-alpha",
    code: "team-alpha",
    depth: 4,
  },
  attributes: {
    department: "engineering",
    level: "senior",
    clearanceLevel: 2,
    employeeId: "EMP123",
    costCenter: "CC-ENG-001",
  },
};

/**
 * Manager user with team access
 */
export const MANAGER_SUBJECT: PolicySubject = {
  principalId: "manager-456",
  principalType: "user",
  roles: ["user", "manager", "approver"],
  groups: ["engineering", "managers"],
  ouMembership: {
    nodeId: "ou-eng",
    path: "/root/hq/engineering",
    code: "engineering",
    depth: 3,
  },
  attributes: {
    department: "engineering",
    level: "manager",
    clearanceLevel: 3,
    employeeId: "EMP456",
    costCenter: "CC-ENG-001",
    directReports: ["user-123", "user-124", "user-125"],
  },
};

/**
 * Guest user with minimal access
 */
export const GUEST_SUBJECT: PolicySubject = {
  principalId: "guest-999",
  principalType: "user",
  roles: ["guest"],
  groups: [],
  attributes: {
    department: "external",
    level: "visitor",
    clearanceLevel: 0,
  },
};

/**
 * Service account
 */
export const SERVICE_SUBJECT: PolicySubject = {
  principalId: "svc-api-gateway",
  principalType: "service",
  roles: ["service", "internal_service"],
  groups: ["services"],
  attributes: {
    serviceType: "api_gateway",
    environment: "production",
  },
};

// ============================================================================
// Test Resource Fixtures
// ============================================================================

/**
 * Public document
 */
export const PUBLIC_DOCUMENT: PolicyResource = {
  type: "document",
  id: "doc-public-001",
  module: "docs",
  ownerId: "user-123",
  attributes: {
    status: "published",
    confidential: false,
    classification: "public",
    tags: ["public", "handbook"],
  },
};

/**
 * Confidential document
 */
export const CONFIDENTIAL_DOCUMENT: PolicyResource = {
  type: "document",
  id: "doc-confidential-001",
  module: "docs",
  ownerId: "manager-456",
  costCenter: "CC-EXEC-001",
  attributes: {
    status: "published",
    confidential: true,
    classification: "confidential",
    tags: ["confidential", "board"],
    requiredClearance: 3,
  },
};

/**
 * Draft document
 */
export const DRAFT_DOCUMENT: PolicyResource = {
  type: "document",
  id: "doc-draft-001",
  module: "docs",
  ownerId: "user-123",
  attributes: {
    status: "draft",
    confidential: false,
    classification: "internal",
    tags: ["draft"],
  },
};

/**
 * Financial record
 */
export const FINANCIAL_RECORD: PolicyResource = {
  type: "financial_record",
  id: "fin-001",
  module: "finance",
  costCenter: "CC-FIN-001",
  attributes: {
    recordType: "expense_report",
    amount: 5000,
    currency: "USD",
    status: "pending_approval",
    fiscalYear: 2024,
  },
};

/**
 * Employee record (PII)
 */
export const EMPLOYEE_RECORD: PolicyResource = {
  type: "employee",
  id: "emp-record-123",
  module: "hr",
  ownerId: "user-123",
  attributes: {
    employeeId: "EMP123",
    hasPII: true,
    department: "engineering",
    salary: 150000,
    ssn: "xxx-xx-xxxx",
  },
};

// ============================================================================
// Test Action Fixtures
// ============================================================================

export const READ_ACTION: PolicyAction = {
  namespace: "ENTITY",
  code: "read",
  fullCode: "ENTITY.read",
};

export const CREATE_ACTION: PolicyAction = {
  namespace: "ENTITY",
  code: "create",
  fullCode: "ENTITY.create",
};

export const UPDATE_ACTION: PolicyAction = {
  namespace: "ENTITY",
  code: "update",
  fullCode: "ENTITY.update",
};

export const DELETE_ACTION: PolicyAction = {
  namespace: "ENTITY",
  code: "delete",
  fullCode: "ENTITY.delete",
};

export const APPROVE_ACTION: PolicyAction = {
  namespace: "WORKFLOW",
  code: "approve",
  fullCode: "WORKFLOW.approve",
};

export const REJECT_ACTION: PolicyAction = {
  namespace: "WORKFLOW",
  code: "reject",
  fullCode: "WORKFLOW.reject",
};

export const EXPORT_ACTION: PolicyAction = {
  namespace: "UTIL",
  code: "export",
  fullCode: "UTIL.export",
};

// ============================================================================
// Test Context Fixtures
// ============================================================================

export function createTestContext(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    tenantId: "test-tenant-001",
    realmId: "test-realm",
    timestamp: new Date("2024-06-15T10:00:00Z"), // Business hours
    channel: "web",
    deviceType: "desktop",
    ipAddress: "192.168.1.100",
    correlationId: `test-${Date.now()}`,
    attributes: {},
    ...overrides,
  };
}

export const BUSINESS_HOURS_CONTEXT = createTestContext({
  timestamp: new Date("2024-06-15T14:00:00Z"), // 2 PM on a weekday
  attributes: {
    isBusinessHours: true,
    isWeekend: false,
    dayOfWeek: "Friday",
  },
});

export const AFTER_HOURS_CONTEXT = createTestContext({
  timestamp: new Date("2024-06-15T23:00:00Z"), // 11 PM
  attributes: {
    isBusinessHours: false,
    isWeekend: false,
    dayOfWeek: "Friday",
  },
});

export const WEEKEND_CONTEXT = createTestContext({
  timestamp: new Date("2024-06-16T14:00:00Z"), // Saturday afternoon
  attributes: {
    isBusinessHours: false,
    isWeekend: true,
    dayOfWeek: "Saturday",
  },
});

// ============================================================================
// Golden Test Pack: Role-Based Access
// ============================================================================

/**
 * Role-based access control tests
 */
export const RBAC_TEST_PACK: PolicyTestCase[] = [
  {
    id: "rbac-001",
    name: "Admin can read any document",
    description: "Admin role should have read access to all documents",
    tags: ["rbac", "admin", "read"],
    enabled: true,
    input: {
      source: "manual",
      subject: ADMIN_SUBJECT,
      resource: CONFIDENTIAL_DOCUMENT,
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    assertions: [
      { type: "effect_equals", value: "allow" },
      { type: "eval_time_under", maxMs: 50 },
    ],
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "rbac-002",
    name: "Admin can delete any document",
    description: "Admin role should have delete access to all documents",
    tags: ["rbac", "admin", "delete"],
    enabled: true,
    input: {
      source: "manual",
      subject: ADMIN_SUBJECT,
      resource: PUBLIC_DOCUMENT,
      action: DELETE_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "rbac-003",
    name: "Regular user can read public document",
    description: "User with 'user' role should read public documents",
    tags: ["rbac", "user", "read"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: PUBLIC_DOCUMENT,
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "rbac-004",
    name: "Guest cannot delete documents",
    description: "Guest role should not have delete access",
    tags: ["rbac", "guest", "delete", "deny"],
    enabled: true,
    input: {
      source: "manual",
      subject: GUEST_SUBJECT,
      resource: PUBLIC_DOCUMENT,
      action: DELETE_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "deny",
      allowed: false,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "rbac-005",
    name: "Guest cannot read confidential document",
    description: "Guest role should not access confidential resources",
    tags: ["rbac", "guest", "confidential", "deny"],
    enabled: true,
    input: {
      source: "manual",
      subject: GUEST_SUBJECT,
      resource: CONFIDENTIAL_DOCUMENT,
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "deny",
      allowed: false,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "rbac-006",
    name: "Manager can approve financial records",
    description: "Manager role with 'approver' permission can approve",
    tags: ["rbac", "manager", "workflow", "approve"],
    enabled: true,
    input: {
      source: "manual",
      subject: MANAGER_SUBJECT,
      resource: FINANCIAL_RECORD,
      action: APPROVE_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "rbac-007",
    name: "Regular user cannot approve financial records",
    description: "User without 'approver' role cannot approve",
    tags: ["rbac", "user", "workflow", "deny"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: FINANCIAL_RECORD,
      action: APPROVE_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "deny",
      allowed: false,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
];

// ============================================================================
// Golden Test Pack: OU/Cost Center Scoped Permissions
// ============================================================================

/**
 * OU and cost center scoped permissions tests
 */
export const OU_SCOPE_TEST_PACK: PolicyTestCase[] = [
  {
    id: "ou-001",
    name: "Manager can read resources in their OU",
    description: "Managers should access resources within their organizational unit",
    tags: ["ou", "scope", "manager", "read"],
    enabled: true,
    input: {
      source: "manual",
      subject: MANAGER_SUBJECT,
      resource: {
        ...DRAFT_DOCUMENT,
        attributes: {
          ...DRAFT_DOCUMENT.attributes,
          ouPath: "/root/hq/engineering/team-alpha",
        },
      },
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "ou-002",
    name: "User cannot access resources outside their OU",
    description: "Users should not access resources in other organizational units",
    tags: ["ou", "scope", "deny"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: {
        ...DRAFT_DOCUMENT,
        attributes: {
          ...DRAFT_DOCUMENT.attributes,
          ouPath: "/root/hq/finance",
        },
      },
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "deny",
      allowed: false,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "ou-003",
    name: "User can access resources in their cost center",
    description: "Users should access resources within their assigned cost center",
    tags: ["costcenter", "scope", "read"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: {
        ...FINANCIAL_RECORD,
        costCenter: "CC-ENG-001", // Same as user's cost center
      },
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "ou-004",
    name: "User cannot access resources in other cost centers",
    description: "Users should not access financial resources in other cost centers",
    tags: ["costcenter", "scope", "deny"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: {
        ...FINANCIAL_RECORD,
        costCenter: "CC-EXEC-001", // Executive cost center
      },
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "deny",
      allowed: false,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
];

// ============================================================================
// Golden Test Pack: Workflow State Transition
// ============================================================================

/**
 * Workflow state transition constraint tests
 */
export const WORKFLOW_TEST_PACK: PolicyTestCase[] = [
  {
    id: "wf-001",
    name: "Can approve pending financial record",
    description: "Approver can approve records in pending_approval status",
    tags: ["workflow", "state", "approve"],
    enabled: true,
    input: {
      source: "manual",
      subject: MANAGER_SUBJECT,
      resource: {
        ...FINANCIAL_RECORD,
        attributes: {
          ...FINANCIAL_RECORD.attributes,
          status: "pending_approval",
        },
      },
      action: APPROVE_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "wf-002",
    name: "Cannot approve already approved record",
    description: "Cannot approve a record that is already approved",
    tags: ["workflow", "state", "invalid_transition"],
    enabled: true,
    input: {
      source: "manual",
      subject: MANAGER_SUBJECT,
      resource: {
        ...FINANCIAL_RECORD,
        attributes: {
          ...FINANCIAL_RECORD.attributes,
          status: "approved",
        },
      },
      action: APPROVE_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "deny",
      allowed: false,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "wf-003",
    name: "Owner can edit draft document",
    description: "Document owner can edit their own draft documents",
    tags: ["workflow", "state", "owner", "edit"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: {
        ...DRAFT_DOCUMENT,
        ownerId: "user-123", // Same as subject
      },
      action: UPDATE_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "wf-004",
    name: "Cannot edit published document",
    description: "Published documents cannot be edited (require unpublish first)",
    tags: ["workflow", "state", "published", "deny"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: {
        ...PUBLIC_DOCUMENT,
        ownerId: "user-123",
        attributes: {
          ...PUBLIC_DOCUMENT.attributes,
          status: "published",
        },
      },
      action: UPDATE_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "deny",
      allowed: false,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
];

// ============================================================================
// Golden Test Pack: Field Masking Obligations
// ============================================================================

/**
 * Field masking and obligation tests
 */
export const OBLIGATIONS_TEST_PACK: PolicyTestCase[] = [
  {
    id: "ob-001",
    name: "PII fields should be masked for non-HR users",
    description: "Reading employee records should require PII masking",
    tags: ["obligations", "masking", "pii"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: EMPLOYEE_RECORD,
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
      obligations: [
        { type: "mask_fields" },
      ],
    },
    assertions: [
      { type: "has_obligation", obligationType: "mask_fields" },
    ],
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "ob-002",
    name: "Confidential access requires audit tag",
    description: "Accessing confidential resources should add audit tag",
    tags: ["obligations", "audit", "confidential"],
    enabled: true,
    input: {
      source: "manual",
      subject: MANAGER_SUBJECT,
      resource: CONFIDENTIAL_DOCUMENT,
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
      obligations: [
        { type: "add_audit_tag" },
      ],
    },
    assertions: [
      { type: "has_obligation", obligationType: "add_audit_tag" },
    ],
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "ob-003",
    name: "Large financial approval requires MFA",
    description: "Approving large financial transactions should require MFA",
    tags: ["obligations", "mfa", "financial"],
    enabled: true,
    input: {
      source: "manual",
      subject: MANAGER_SUBJECT,
      resource: {
        ...FINANCIAL_RECORD,
        attributes: {
          ...FINANCIAL_RECORD.attributes,
          amount: 100000, // Large amount
        },
      },
      action: APPROVE_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
      obligations: [
        { type: "require_mfa" },
      ],
    },
    assertions: [
      { type: "has_obligation", obligationType: "require_mfa" },
    ],
    createdAt: new Date(),
    createdBy: "system",
  },
];

// ============================================================================
// Golden Test Pack: Time-Based Policies
// ============================================================================

/**
 * Time-based policy tests (business hours, blackout periods)
 */
export const TIME_BASED_TEST_PACK: PolicyTestCase[] = [
  {
    id: "time-001",
    name: "Financial operations allowed during business hours",
    description: "Financial operations should be allowed during business hours",
    tags: ["time", "business_hours", "allow"],
    enabled: true,
    input: {
      source: "manual",
      subject: MANAGER_SUBJECT,
      resource: FINANCIAL_RECORD,
      action: APPROVE_ACTION,
      context: BUSINESS_HOURS_CONTEXT,
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "time-002",
    name: "Financial operations restricted after hours",
    description: "Financial operations should be restricted after business hours",
    tags: ["time", "after_hours", "deny"],
    enabled: true,
    input: {
      source: "manual",
      subject: MANAGER_SUBJECT,
      resource: FINANCIAL_RECORD,
      action: APPROVE_ACTION,
      context: AFTER_HOURS_CONTEXT,
    },
    expected: {
      effect: "deny",
      allowed: false,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "time-003",
    name: "Admin can bypass time restrictions",
    description: "Admin users should be able to operate at any time",
    tags: ["time", "admin", "bypass"],
    enabled: true,
    input: {
      source: "manual",
      subject: ADMIN_SUBJECT,
      resource: FINANCIAL_RECORD,
      action: APPROVE_ACTION,
      context: WEEKEND_CONTEXT,
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "time-004",
    name: "Read operations allowed outside business hours",
    description: "Read-only operations should work at any time",
    tags: ["time", "read", "allow"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: PUBLIC_DOCUMENT,
      action: READ_ACTION,
      context: AFTER_HOURS_CONTEXT,
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    createdAt: new Date(),
    createdBy: "system",
  },
];

// ============================================================================
// Golden Test Pack: Performance Budget Tests
// ============================================================================

/**
 * Performance budget tests
 */
export const PERFORMANCE_TEST_PACK: PolicyTestCase[] = [
  {
    id: "perf-001",
    name: "Simple role check under 10ms",
    description: "Basic role-based check should complete within 10ms",
    tags: ["performance", "budget"],
    enabled: true,
    input: {
      source: "manual",
      subject: ADMIN_SUBJECT,
      resource: PUBLIC_DOCUMENT,
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    assertions: [
      { type: "eval_time_under", maxMs: 10 },
    ],
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "perf-002",
    name: "Complex condition evaluation under 25ms",
    description: "Multi-condition evaluation should complete within 25ms",
    tags: ["performance", "budget", "conditions"],
    enabled: true,
    input: {
      source: "manual",
      subject: MANAGER_SUBJECT,
      resource: CONFIDENTIAL_DOCUMENT,
      action: READ_ACTION,
      context: BUSINESS_HOURS_CONTEXT,
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    assertions: [
      { type: "eval_time_under", maxMs: 25 },
    ],
    createdAt: new Date(),
    createdBy: "system",
  },
  {
    id: "perf-003",
    name: "Full evaluation with explain under 50ms",
    description: "Full evaluation including explain tree should complete within 50ms",
    tags: ["performance", "budget", "explain"],
    enabled: true,
    input: {
      source: "manual",
      subject: REGULAR_USER_SUBJECT,
      resource: FINANCIAL_RECORD,
      action: READ_ACTION,
      context: createTestContext(),
    },
    expected: {
      effect: "allow",
      allowed: true,
    },
    assertions: [
      { type: "eval_time_under", maxMs: 50 },
    ],
    createdAt: new Date(),
    createdBy: "system",
  },
];

// ============================================================================
// Regression Test Pack (All Critical Tests)
// ============================================================================

/**
 * Combined regression test pack for CI
 */
export const REGRESSION_TEST_PACK: PolicyTestCase[] = [
  // Include critical tests from each category
  ...RBAC_TEST_PACK.filter((t) => ["rbac-001", "rbac-004", "rbac-007"].includes(t.id)),
  ...OU_SCOPE_TEST_PACK.filter((t) => ["ou-001", "ou-002"].includes(t.id)),
  ...WORKFLOW_TEST_PACK.filter((t) => ["wf-001", "wf-002"].includes(t.id)),
  ...TIME_BASED_TEST_PACK.filter((t) => ["time-001", "time-002"].includes(t.id)),
  ...PERFORMANCE_TEST_PACK,
];

// ============================================================================
// All Test Packs
// ============================================================================

/**
 * Golden test pack structure (for test runner)
 */
export interface GoldenTestPack {
  name: string;
  testCases: PolicyTestCase[];
}

/**
 * Get all test packs
 */
export function getAllTestPacks(): Record<string, PolicyTestCase[]> {
  return {
    rbac: RBAC_TEST_PACK,
    ou_scope: OU_SCOPE_TEST_PACK,
    workflow: WORKFLOW_TEST_PACK,
    obligations: OBLIGATIONS_TEST_PACK,
    time_based: TIME_BASED_TEST_PACK,
    performance: PERFORMANCE_TEST_PACK,
    regression: REGRESSION_TEST_PACK,
  };
}

/**
 * Get all golden test packs as structured objects (for test runner)
 */
export function getAllGoldenTestPacks(): GoldenTestPack[] {
  return [
    { name: "RBAC Test Pack", testCases: RBAC_TEST_PACK },
    { name: "OU Scope Test Pack", testCases: OU_SCOPE_TEST_PACK },
    { name: "Workflow Test Pack", testCases: WORKFLOW_TEST_PACK },
    { name: "Obligations Test Pack", testCases: OBLIGATIONS_TEST_PACK },
    { name: "Time-Based Test Pack", testCases: TIME_BASED_TEST_PACK },
    { name: "Performance Test Pack", testCases: PERFORMANCE_TEST_PACK },
  ];
}

/**
 * Get a specific golden test pack by name
 */
export function getGoldenTestPack(name: string): GoldenTestPack | undefined {
  return getAllGoldenTestPacks().find((p) => p.name === name);
}

/**
 * Get test pack by name
 */
export function getTestPack(name: string): PolicyTestCase[] | undefined {
  const packs = getAllTestPacks();
  return packs[name];
}

/**
 * Get all golden tests as a flat list
 */
export function getAllGoldenTests(): PolicyTestCase[] {
  return [
    ...RBAC_TEST_PACK,
    ...OU_SCOPE_TEST_PACK,
    ...WORKFLOW_TEST_PACK,
    ...OBLIGATIONS_TEST_PACK,
    ...TIME_BASED_TEST_PACK,
    ...PERFORMANCE_TEST_PACK,
  ];
}

/**
 * Get test count summary
 */
export function getTestSummary(): Record<string, number> {
  const packs = getAllTestPacks();
  const summary: Record<string, number> = {};

  for (const [name, tests] of Object.entries(packs)) {
    summary[name] = tests.length;
  }

  summary.total = Object.values(packs)
    .filter((_, i, arr) => arr.indexOf(_) === i) // Dedupe
    .flat()
    .length;

  return summary;
}
