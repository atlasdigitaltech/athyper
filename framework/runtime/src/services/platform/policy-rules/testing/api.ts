/**
 * Policy Simulator API Endpoints
 *
 * B: Simulator API Endpoints
 * - POST /api/policy/simulate → returns decision + explain tree
 * - POST /api/policy/validate → validates policy definition schema + expressions
 * - GET /api/policy/testcases/:policyId → list saved cases
 * - POST /api/policy/testcases → save a testcase
 * - POST /api/policy/testcases/:id/run → run a specific testcase
 * - POST /api/policy/testcases/run → run multiple testcases
 */

import type {
  IPolicySimulator,
  ITestCaseRepository,
  PolicyTestCase,
  PolicyValidationResult,
  SimulatorInput,
  SimulatorOptions,
  SimulatorResult,
  StoredTestCase,
  TestCaseRunResult,
  TestSuiteResult,
  ValidationOptions,
} from "./types.js";

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Simulate request body
 */
export type SimulateRequest = {
  /** Simulation input */
  input: SimulatorInput;
  /** Simulation options */
  options?: SimulatorOptions;
};

/**
 * Simulate response
 */
export type SimulateResponse = SimulatorResult;

/**
 * Validate policy request body
 */
export type ValidatePolicyRequest = {
  /** Policy definition to validate */
  policy: unknown;
  /** Validation options */
  options?: ValidationOptions;
};

/**
 * Validate policy response
 */
export type ValidatePolicyResponse = PolicyValidationResult;

/**
 * List test cases request query params
 */
export type ListTestCasesQuery = {
  /** Filter by policy ID */
  policyId?: string;
  /** Filter by tags (comma-separated) */
  tags?: string;
  /** Filter by enabled status */
  enabled?: "true" | "false";
  /** Limit results */
  limit?: string;
  /** Offset for pagination */
  offset?: string;
};

/**
 * List test cases response
 */
export type ListTestCasesResponse = {
  testCases: StoredTestCase[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * Create test case request body
 */
export type CreateTestCaseRequest = Omit<PolicyTestCase, "id" | "createdAt">;

/**
 * Create test case response
 */
export type CreateTestCaseResponse = StoredTestCase;

/**
 * Update test case request body
 */
export type UpdateTestCaseRequest = Partial<PolicyTestCase>;

/**
 * Update test case response
 */
export type UpdateTestCaseResponse = StoredTestCase;

/**
 * Run test case response
 */
export type RunTestCaseResponse = TestCaseRunResult;

/**
 * Run test suite request body
 */
export type RunTestSuiteRequest = {
  /** Test case IDs to run (if empty, runs all enabled) */
  testCaseIds?: string[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by policy ID */
  policyId?: string;
  /** Suite name */
  suiteName?: string;
};

/**
 * Run test suite response
 */
export type RunTestSuiteResponse = TestSuiteResult;

// ============================================================================
// API Handler Type
// ============================================================================

/**
 * API context (from middleware)
 */
export type ApiContext = {
  tenantId: string;
  userId: string;
  realmId?: string;
  correlationId: string;
};

/**
 * API handler function type
 */
export type ApiHandler<TReq, TRes> = (
  ctx: ApiContext,
  body: TReq
) => Promise<TRes>;

// ============================================================================
// Policy Simulator API Controller
// ============================================================================

/**
 * Policy Simulator API Controller
 *
 * Provides HTTP API handlers for policy simulation and testing
 */
export class PolicySimulatorApiController {
  constructor(
    private readonly simulator: IPolicySimulator,
    private readonly testCaseRepository: ITestCaseRepository
  ) {}

  // ============================================================================
  // Simulation Endpoints
  // ============================================================================

  /**
   * POST /api/policy/simulate
   *
   * Run policy simulation (dry-run)
   */
  async simulate(
    ctx: ApiContext,
    request: SimulateRequest
  ): Promise<SimulateResponse> {
    // Validate request
    if (!request.input) {
      throw new ApiError("INVALID_REQUEST", "input is required", 400);
    }

    if (!request.input.source) {
      throw new ApiError("INVALID_REQUEST", "input.source is required", 400);
    }

    // Run simulation
    const result = await this.simulator.simulate(
      ctx.tenantId,
      request.input,
      request.options
    );

    return result;
  }

  /**
   * POST /api/policy/validate
   *
   * Validate policy definition
   */
  async validatePolicy(
    ctx: ApiContext,
    request: ValidatePolicyRequest
  ): Promise<ValidatePolicyResponse> {
    // Validate request
    if (!request.policy) {
      throw new ApiError("INVALID_REQUEST", "policy is required", 400);
    }

    // Run validation
    const result = await this.simulator.validatePolicy(
      request.policy,
      request.options
    );

    return result;
  }

  // ============================================================================
  // Test Case CRUD Endpoints
  // ============================================================================

  /**
   * GET /api/policy/testcases
   *
   * List test cases
   */
  async listTestCases(
    ctx: ApiContext,
    query: ListTestCasesQuery
  ): Promise<ListTestCasesResponse> {
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const tags = query.tags ? query.tags.split(",").map((t) => t.trim()) : undefined;
    const enabled = query.enabled === "true" ? true : query.enabled === "false" ? false : undefined;

    const testCases = await this.testCaseRepository.list(ctx.tenantId, {
      policyId: query.policyId,
      tags,
      enabled,
      limit,
      offset,
    });

    return {
      testCases,
      total: testCases.length, // Would need count query for accurate total
      limit,
      offset,
    };
  }

  /**
   * GET /api/policy/testcases/:policyId
   *
   * List test cases for a specific policy
   */
  async listTestCasesByPolicy(
    ctx: ApiContext,
    policyId: string
  ): Promise<ListTestCasesResponse> {
    const testCases = await this.testCaseRepository.getByPolicy(ctx.tenantId, policyId);

    return {
      testCases,
      total: testCases.length,
      limit: testCases.length,
      offset: 0,
    };
  }

  /**
   * GET /api/policy/testcases/id/:id
   *
   * Get a specific test case
   */
  async getTestCase(
    ctx: ApiContext,
    testCaseId: string
  ): Promise<StoredTestCase> {
    const testCase = await this.testCaseRepository.getById(ctx.tenantId, testCaseId);

    if (!testCase) {
      throw new ApiError("NOT_FOUND", `Test case not found: ${testCaseId}`, 404);
    }

    return testCase;
  }

  /**
   * POST /api/policy/testcases
   *
   * Create a new test case
   */
  async createTestCase(
    ctx: ApiContext,
    request: CreateTestCaseRequest
  ): Promise<CreateTestCaseResponse> {
    // Validate request
    if (!request.name) {
      throw new ApiError("INVALID_REQUEST", "name is required", 400);
    }
    if (!request.input) {
      throw new ApiError("INVALID_REQUEST", "input is required", 400);
    }
    if (!request.expected) {
      throw new ApiError("INVALID_REQUEST", "expected is required", 400);
    }

    // Create test case
    const testCase = await this.testCaseRepository.create(
      ctx.tenantId,
      request,
      ctx.userId
    );

    return testCase;
  }

  /**
   * PUT /api/policy/testcases/:id
   *
   * Update a test case
   */
  async updateTestCase(
    ctx: ApiContext,
    testCaseId: string,
    request: UpdateTestCaseRequest
  ): Promise<UpdateTestCaseResponse> {
    // Check exists
    const existing = await this.testCaseRepository.getById(ctx.tenantId, testCaseId);
    if (!existing) {
      throw new ApiError("NOT_FOUND", `Test case not found: ${testCaseId}`, 404);
    }

    // Update
    const updated = await this.testCaseRepository.update(
      ctx.tenantId,
      testCaseId,
      request,
      ctx.userId
    );

    return updated;
  }

  /**
   * DELETE /api/policy/testcases/:id
   *
   * Delete a test case
   */
  async deleteTestCase(
    ctx: ApiContext,
    testCaseId: string
  ): Promise<{ success: boolean }> {
    // Check exists
    const existing = await this.testCaseRepository.getById(ctx.tenantId, testCaseId);
    if (!existing) {
      throw new ApiError("NOT_FOUND", `Test case not found: ${testCaseId}`, 404);
    }

    // Delete
    await this.testCaseRepository.delete(ctx.tenantId, testCaseId);

    return { success: true };
  }

  // ============================================================================
  // Test Execution Endpoints
  // ============================================================================

  /**
   * POST /api/policy/testcases/:id/run
   *
   * Run a specific test case
   */
  async runTestCase(
    ctx: ApiContext,
    testCaseId: string
  ): Promise<RunTestCaseResponse> {
    // Get test case
    const testCase = await this.testCaseRepository.getById(ctx.tenantId, testCaseId);
    if (!testCase) {
      throw new ApiError("NOT_FOUND", `Test case not found: ${testCaseId}`, 404);
    }

    // Run test
    const result = await this.simulator.runTestCase(ctx.tenantId, testCase);

    // Update last run result
    await this.testCaseRepository.updateRunResult(ctx.tenantId, testCaseId, result);

    return result;
  }

  /**
   * POST /api/policy/testcases/run
   *
   * Run multiple test cases
   */
  async runTestSuite(
    ctx: ApiContext,
    request: RunTestSuiteRequest
  ): Promise<RunTestSuiteResponse> {
    let testCases: StoredTestCase[];

    if (request.testCaseIds && request.testCaseIds.length > 0) {
      // Run specific test cases
      testCases = [];
      for (const id of request.testCaseIds) {
        const tc = await this.testCaseRepository.getById(ctx.tenantId, id);
        if (tc) {
          testCases.push(tc);
        }
      }
    } else if (request.tags && request.tags.length > 0) {
      // Run by tags
      testCases = await this.testCaseRepository.getByTags(ctx.tenantId, request.tags);
    } else if (request.policyId) {
      // Run by policy
      testCases = await this.testCaseRepository.getByPolicy(ctx.tenantId, request.policyId);
    } else {
      // Run all enabled
      testCases = await this.testCaseRepository.list(ctx.tenantId, { enabled: true });
    }

    // Run suite
    const result = await this.simulator.runTestSuite(
      ctx.tenantId,
      testCases,
      request.suiteName
    );

    // Update run results for each test
    for (const testResult of result.testResults) {
      await this.testCaseRepository.updateRunResult(
        ctx.tenantId,
        testResult.testCaseId,
        testResult
      );
    }

    return result;
  }
}

// ============================================================================
// API Error
// ============================================================================

/**
 * API Error
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

// ============================================================================
// Route Definitions
// ============================================================================

/**
 * Route definition for registering with router
 */
export type RouteDefinition = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  handler: string;
  description: string;
};

/**
 * Get route definitions for simulator API
 */
export function getSimulatorRoutes(): RouteDefinition[] {
  return [
    {
      method: "POST",
      path: "/api/policy/simulate",
      handler: "simulate",
      description: "Run policy simulation (dry-run)",
    },
    {
      method: "POST",
      path: "/api/policy/validate",
      handler: "validatePolicy",
      description: "Validate policy definition schema and expressions",
    },
    {
      method: "GET",
      path: "/api/policy/testcases",
      handler: "listTestCases",
      description: "List test cases",
    },
    {
      method: "GET",
      path: "/api/policy/testcases/:policyId",
      handler: "listTestCasesByPolicy",
      description: "List test cases for a policy",
    },
    {
      method: "GET",
      path: "/api/policy/testcases/id/:id",
      handler: "getTestCase",
      description: "Get a specific test case",
    },
    {
      method: "POST",
      path: "/api/policy/testcases",
      handler: "createTestCase",
      description: "Create a new test case",
    },
    {
      method: "PUT",
      path: "/api/policy/testcases/:id",
      handler: "updateTestCase",
      description: "Update a test case",
    },
    {
      method: "DELETE",
      path: "/api/policy/testcases/:id",
      handler: "deleteTestCase",
      description: "Delete a test case",
    },
    {
      method: "POST",
      path: "/api/policy/testcases/:id/run",
      handler: "runTestCase",
      description: "Run a specific test case",
    },
    {
      method: "POST",
      path: "/api/policy/testcases/run",
      handler: "runTestSuite",
      description: "Run multiple test cases as a suite",
    },
  ];
}

/**
 * Create policy simulator API controller
 */
export function createPolicySimulatorApi(
  simulator: IPolicySimulator,
  testCaseRepository: ITestCaseRepository
): PolicySimulatorApiController {
  return new PolicySimulatorApiController(simulator, testCaseRepository);
}
