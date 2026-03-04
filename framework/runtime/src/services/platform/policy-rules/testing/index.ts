/**
 * Policy Engine Testing Module
 *
 * This module provides a comprehensive testing framework for policy evaluation:
 * - Policy Simulator with dry-run mode and explain output
 * - Test case management and storage
 * - Golden test packs for regression testing
 * - CI automation with coverage and performance reporting
 *
 * @module policy/testing
 */

// Types
export type {
  // Simulator types
  SimulatorInput,
  ManualSimulatorInput,
  TenantDataInput,
  AuditReplayInput,
  SimulatorResult,
  SimulatorExplainTree,
  PolicyValidationResult,
  ValidationError,

  // Test case types
  PolicyTestCase,
  TestCaseAssertion,
  ExpectedDecision,
  StoredTestCase,
  TestCaseRunResult,
  TestSuiteResult,

  // Interfaces
  IPolicySimulator,
  ITestCaseRepository,
} from "./types.js";

// Simulator Service
export { PolicySimulatorService, createPolicySimulator } from "./simulator.service.js";

// Test Case Repository
export {
  InMemoryTestCaseRepository,
  DatabaseTestCaseRepository,
  createInMemoryTestCaseRepository,
  createDatabaseTestCaseRepository,
} from "./testcase-repository.js";

// API Controller and Routes
export {
  PolicySimulatorApiController,
  getSimulatorRoutes,
  ApiError,
  type SimulateRequest,
  type SimulateResponse,
  type ValidatePolicyRequest,
  type ValidatePolicyResponse,
  type ListTestCasesQuery,
  type ListTestCasesResponse,
  type CreateTestCaseRequest,
  type CreateTestCaseResponse,
  type RunTestCaseResponse,
  type RunTestSuiteRequest,
  type RunTestSuiteResponse,
  type RouteDefinition,
} from "./api.js";

// Golden Tests
export {
  // Subject fixtures
  ADMIN_SUBJECT,
  REGULAR_USER_SUBJECT,
  MANAGER_SUBJECT,
  GUEST_SUBJECT,
  SERVICE_SUBJECT,

  // Resource fixtures
  PUBLIC_DOCUMENT,
  CONFIDENTIAL_DOCUMENT,
  DRAFT_DOCUMENT,
  FINANCIAL_RECORD,
  EMPLOYEE_RECORD,

  // Action fixtures
  READ_ACTION,
  CREATE_ACTION,
  UPDATE_ACTION,
  DELETE_ACTION,
  APPROVE_ACTION,
  REJECT_ACTION,
  EXPORT_ACTION,

  // Context fixtures
  BUSINESS_HOURS_CONTEXT,
  AFTER_HOURS_CONTEXT,
  WEEKEND_CONTEXT,

  // Test packs
  RBAC_TEST_PACK,
  OU_SCOPE_TEST_PACK,
  WORKFLOW_TEST_PACK,
  OBLIGATIONS_TEST_PACK,
  TIME_BASED_TEST_PACK,
  PERFORMANCE_TEST_PACK,
  REGRESSION_TEST_PACK,

  // Utility functions
  getAllGoldenTestPacks,
  getGoldenTestPack,
  getAllGoldenTests,
  getAllTestPacks,
  type GoldenTestPack,
} from "./golden-tests.js";

// Test Runner
export {
  PolicyTestRunner,
  createPolicyTestRunner,
  formatReportAsText,
  formatReportAsJson,
  formatReportAsJUnit,
  DEFAULT_PERFORMANCE_BUDGET,
  DEFAULT_TEST_RUNNER_CONFIG,
  type PerformanceBudget,
  type TestRunnerConfig,
  type PerformanceMetrics,
  type BudgetViolation,
  type CoverageReport,
  type TestRunReport,
  type FailureSummary,
} from "./test-runner.js";
