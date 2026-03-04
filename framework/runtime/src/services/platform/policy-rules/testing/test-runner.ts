/**
 * Policy Test Runner
 *
 * F: CI automation
 * - Loads fixtures and golden test packs
 * - Runs simulator evaluations
 * - Asserts expected results
 * - Reports coverage and performance metrics
 * - Enforces performance budgets
 */

import {
  getAllGoldenTestPacks,
  getGoldenTestPack,
  REGRESSION_TEST_PACK,
  type GoldenTestPack,
} from "./golden-tests.js";

import type {
  IPolicySimulator,
  ITestCaseRepository,
  TestCaseRunResult,
  TestSuiteResult,
} from "./types.js";

// ============================================================================
// Performance Budget Configuration
// ============================================================================

export interface PerformanceBudget {
  /** Maximum evaluation time for a single policy (milliseconds) */
  maxEvaluationTimeMs: number;
  /** Maximum evaluation time for test suites (milliseconds) */
  maxSuiteTimeMs: number;
  /** P95 evaluation time target (milliseconds) */
  p95TargetMs: number;
  /** P99 evaluation time target (milliseconds) */
  p99TargetMs: number;
}

export const DEFAULT_PERFORMANCE_BUDGET: PerformanceBudget = {
  maxEvaluationTimeMs: 10, // 10ms max for typical rules
  maxSuiteTimeMs: 5000, // 5 seconds for full suite
  p95TargetMs: 5, // 95th percentile should be under 5ms
  p99TargetMs: 8, // 99th percentile should be under 8ms
};

// ============================================================================
// Test Runner Configuration
// ============================================================================

export interface TestRunnerConfig {
  /** Performance budget to enforce */
  performanceBudget: PerformanceBudget;
  /** Whether to fail on performance budget violations */
  failOnBudgetViolation: boolean;
  /** Whether to run performance tests (may be disabled in CI for speed) */
  runPerformanceTests: boolean;
  /** Verbose output */
  verbose: boolean;
  /** Test timeout (ms) */
  testTimeoutMs: number;
}

export const DEFAULT_TEST_RUNNER_CONFIG: TestRunnerConfig = {
  performanceBudget: DEFAULT_PERFORMANCE_BUDGET,
  failOnBudgetViolation: true,
  runPerformanceTests: true,
  verbose: false,
  testTimeoutMs: 30000,
};

// ============================================================================
// Test Results and Reports
// ============================================================================

export interface PerformanceMetrics {
  totalEvaluations: number;
  totalTimeMs: number;
  averageTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  p50TimeMs: number;
  p95TimeMs: number;
  p99TimeMs: number;
  budgetViolations: BudgetViolation[];
}

export interface BudgetViolation {
  testName: string;
  metric: keyof PerformanceBudget;
  actual: number;
  budget: number;
  severity: "warning" | "error";
}

export interface CoverageReport {
  /** Number of test packs run */
  testPacksRun: number;
  /** Total test cases executed */
  totalTestCases: number;
  /** Test cases passed */
  passed: number;
  /** Test cases failed */
  failed: number;
  /** Test cases with errors */
  errors: number;
  /** Test cases skipped */
  skipped: number;
  /** Pass rate percentage */
  passRate: number;
  /** Categories covered */
  categoriesCovered: string[];
  /** Scenarios covered */
  scenariosCovered: string[];
}

export interface TestRunReport {
  /** Run timestamp */
  runAt: Date;
  /** Total duration */
  durationMs: number;
  /** Overall success */
  success: boolean;
  /** Coverage report */
  coverage: CoverageReport;
  /** Performance metrics */
  performance: PerformanceMetrics;
  /** Individual test pack results */
  packResults: Map<string, TestSuiteResult>;
  /** Summary of failures */
  failures: FailureSummary[];
  /** Budget violations */
  budgetViolations: BudgetViolation[];
}

export interface FailureSummary {
  packName: string;
  testName: string;
  expected: string;
  actual: string;
  reason?: string;
}

// ============================================================================
// Policy Test Runner
// ============================================================================

export class PolicyTestRunner {
  private config: TestRunnerConfig;
  private evaluationTimes: number[] = [];

  constructor(
    private readonly simulator: IPolicySimulator,
    private readonly repository?: ITestCaseRepository,
    config?: Partial<TestRunnerConfig>
  ) {
    this.config = { ...DEFAULT_TEST_RUNNER_CONFIG, ...config };
  }

  /**
   * Run all golden test packs
   */
  async runAllGoldenTests(): Promise<TestRunReport> {
    const startTime = Date.now();
    const packResults = new Map<string, TestSuiteResult>();
    const failures: FailureSummary[] = [];
    this.evaluationTimes = [];

    const allPacks = getAllGoldenTestPacks();

    // Filter out performance tests if disabled
    const packsToRun = this.config.runPerformanceTests
      ? allPacks
      : allPacks.filter((p) => p.name !== "Performance Test Pack");

    for (const pack of packsToRun) {
      const result = await this.runTestPack(pack);
      packResults.set(pack.name, result);

      // Collect failures
      for (const testResult of result.testResults) {
        if (!testResult.passed) {
          failures.push({
            packName: pack.name,
            testName: testResult.testCaseName,
            expected: "allow", // Simplified
            actual: testResult.simulatorResult.decision.effect,
            reason: testResult.failureReason,
          });
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const performance = this.calculatePerformanceMetrics();
    const budgetViolations = this.checkBudgetViolations(performance);
    const coverage = this.calculateCoverage(packResults);

    const success =
      failures.length === 0 &&
      (!this.config.failOnBudgetViolation ||
        budgetViolations.filter((v) => v.severity === "error").length === 0);

    return {
      runAt: new Date(),
      durationMs,
      success,
      coverage,
      performance,
      packResults,
      failures,
      budgetViolations,
    };
  }

  /**
   * Run a specific golden test pack by name
   */
  async runGoldenTestPack(packName: string): Promise<TestSuiteResult | undefined> {
    const pack = getGoldenTestPack(packName);
    if (!pack) return undefined;
    return this.runTestPack(pack);
  }

  /**
   * Run the regression test pack (critical tests only)
   */
  async runRegressionTests(): Promise<TestRunReport> {
    const startTime = Date.now();
    const packResults = new Map<string, TestSuiteResult>();
    const failures: FailureSummary[] = [];
    this.evaluationTimes = [];

    const regressionPack: GoldenTestPack = {
      name: "Regression Test Pack",
      testCases: REGRESSION_TEST_PACK,
    };

    const result = await this.runTestPack(regressionPack);
    packResults.set(regressionPack.name, result);

    for (const testResult of result.testResults) {
      if (!testResult.passed) {
        failures.push({
          packName: regressionPack.name,
          testName: testResult.testCaseName,
          expected: "allow", // Simplified - actual expected is in test case
          actual: testResult.simulatorResult.decision.effect,
          reason: testResult.failureReason,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    const performance = this.calculatePerformanceMetrics();
    const budgetViolations = this.checkBudgetViolations(performance);
    const coverage = this.calculateCoverage(packResults);

    const success =
      failures.length === 0 &&
      (!this.config.failOnBudgetViolation ||
        budgetViolations.filter((v) => v.severity === "error").length === 0);

    return {
      runAt: new Date(),
      durationMs,
      success,
      coverage,
      performance,
      packResults,
      failures,
      budgetViolations,
    };
  }

  /**
   * Run saved test cases from repository
   */
  async runSavedTestCases(
    tenantId: string,
    options?: {
      policyId?: string;
      tags?: string[];
    }
  ): Promise<TestRunReport> {
    if (!this.repository) {
      throw new Error("Test case repository not configured");
    }

    const startTime = Date.now();
    const packResults = new Map<string, TestSuiteResult>();
    const failures: FailureSummary[] = [];
    this.evaluationTimes = [];

    const testCases = await this.repository.list(tenantId, options);

    const results: TestCaseRunResult[] = [];
    for (const storedTestCase of testCases) {
      const result = await this.simulator.runTestCase(tenantId, storedTestCase);
      results.push(result);
      this.evaluationTimes.push(result.durationMs);

      // Update repository with result
      await this.repository.updateRunResult(tenantId, storedTestCase.id, result);

      if (!result.passed) {
        failures.push({
          packName: "Saved Test Cases",
          testName: result.testCaseName,
          expected: "allow", // Simplified
          actual: result.simulatorResult.decision.effect,
          reason: result.failureReason,
        });
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed && r.simulatorResult.success).length;
    const errorCount = results.filter((r) => !r.simulatorResult.success).length;

    const suiteResult: TestSuiteResult = {
      suiteName: "Saved Test Cases",
      totalTests: results.length,
      passedTests: passedCount,
      failedTests: failedCount,
      skippedTests: 0,
      errorTests: errorCount,
      testResults: results,
      durationMs: Date.now() - startTime,
      runAt: new Date(),
      passRate: results.length > 0 ? (passedCount / results.length) * 100 : 0,
    };

    packResults.set("Saved Test Cases", suiteResult);

    const durationMs = Date.now() - startTime;
    const performance = this.calculatePerformanceMetrics();
    const budgetViolations = this.checkBudgetViolations(performance);
    const coverage = this.calculateCoverage(packResults);

    const success =
      failures.length === 0 &&
      (!this.config.failOnBudgetViolation ||
        budgetViolations.filter((v) => v.severity === "error").length === 0);

    return {
      runAt: new Date(),
      durationMs,
      success,
      coverage,
      performance,
      packResults,
      failures,
      budgetViolations,
    };
  }

  /**
   * Run a test pack
   */
  private async runTestPack(pack: GoldenTestPack): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestCaseRunResult[] = [];
    const tenantId = "test-tenant"; // Default tenant for golden tests

    for (const testCase of pack.testCases) {
      const result = await this.simulator.runTestCase(tenantId, testCase);
      results.push(result);
      this.evaluationTimes.push(result.durationMs);

      if (this.config.verbose) {
        const status = result.passed ? "✓" : "✗";
        console.log(`  ${status} ${testCase.name} (${result.durationMs}ms)`);
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed && r.simulatorResult.success).length;
    const errorCount = results.filter((r) => !r.simulatorResult.success).length;

    return {
      suiteName: pack.name,
      totalTests: results.length,
      passedTests: passedCount,
      failedTests: failedCount,
      skippedTests: 0,
      errorTests: errorCount,
      testResults: results,
      durationMs: Date.now() - startTime,
      runAt: new Date(),
      passRate: results.length > 0 ? (passedCount / results.length) * 100 : 0,
    };
  }

  /**
   * Calculate performance metrics from evaluation times
   */
  private calculatePerformanceMetrics(): PerformanceMetrics {
    if (this.evaluationTimes.length === 0) {
      return {
        totalEvaluations: 0,
        totalTimeMs: 0,
        averageTimeMs: 0,
        minTimeMs: 0,
        maxTimeMs: 0,
        p50TimeMs: 0,
        p95TimeMs: 0,
        p99TimeMs: 0,
        budgetViolations: [],
      };
    }

    const sorted = [...this.evaluationTimes].sort((a, b) => a - b);
    const total = sorted.reduce((sum, t) => sum + t, 0);

    return {
      totalEvaluations: sorted.length,
      totalTimeMs: total,
      averageTimeMs: total / sorted.length,
      minTimeMs: sorted[0],
      maxTimeMs: sorted[sorted.length - 1],
      p50TimeMs: this.percentile(sorted, 50),
      p95TimeMs: this.percentile(sorted, 95),
      p99TimeMs: this.percentile(sorted, 99),
      budgetViolations: [],
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Check for budget violations
   */
  private checkBudgetViolations(metrics: PerformanceMetrics): BudgetViolation[] {
    const violations: BudgetViolation[] = [];
    const budget = this.config.performanceBudget;

    if (metrics.maxTimeMs > budget.maxEvaluationTimeMs) {
      violations.push({
        testName: "Overall",
        metric: "maxEvaluationTimeMs",
        actual: metrics.maxTimeMs,
        budget: budget.maxEvaluationTimeMs,
        severity: "error",
      });
    }

    if (metrics.p95TimeMs > budget.p95TargetMs) {
      violations.push({
        testName: "P95",
        metric: "p95TargetMs",
        actual: metrics.p95TimeMs,
        budget: budget.p95TargetMs,
        severity: "warning",
      });
    }

    if (metrics.p99TimeMs > budget.p99TargetMs) {
      violations.push({
        testName: "P99",
        metric: "p99TargetMs",
        actual: metrics.p99TimeMs,
        budget: budget.p99TargetMs,
        severity: "warning",
      });
    }

    return violations;
  }

  /**
   * Calculate coverage report
   */
  private calculateCoverage(packResults: Map<string, TestSuiteResult>): CoverageReport {
    let totalTestCases = 0;
    let passed = 0;
    let failed = 0;
    let errors = 0;
    const categoriesCovered = new Set<string>();
    const scenariosCovered = new Set<string>();

    for (const [packName, result] of packResults) {
      totalTestCases += result.totalTests;
      passed += result.passedTests;
      failed += result.failedTests;
      errors += result.errorTests;

      // Extract category from pack name
      const category = packName.replace(" Test Pack", "");
      categoriesCovered.add(category);

      // Extract scenarios from test names
      for (const testResult of result.testResults) {
        const scenario = testResult.testCaseName;
        scenariosCovered.add(scenario);
      }
    }

    return {
      testPacksRun: packResults.size,
      totalTestCases,
      passed,
      failed,
      errors,
      skipped: 0,
      passRate: totalTestCases > 0 ? (passed / totalTestCases) * 100 : 0,
      categoriesCovered: Array.from(categoriesCovered),
      scenariosCovered: Array.from(scenariosCovered),
    };
  }
}

// ============================================================================
// Report Formatters
// ============================================================================

/**
 * Format test run report as text for console output
 */
export function formatReportAsText(report: TestRunReport): string {
  const lines: string[] = [];

  lines.push("═".repeat(60));
  lines.push("POLICY TEST RUN REPORT");
  lines.push("═".repeat(60));
  lines.push("");

  // Overall status
  lines.push(`Status: ${report.success ? "✓ PASSED" : "✗ FAILED"}`);
  lines.push(`Run at: ${report.runAt.toISOString()}`);
  lines.push(`Duration: ${report.durationMs}ms`);
  lines.push("");

  // Coverage
  lines.push("─".repeat(60));
  lines.push("COVERAGE");
  lines.push("─".repeat(60));
  lines.push(`Test Packs: ${report.coverage.testPacksRun}`);
  lines.push(`Total Tests: ${report.coverage.totalTestCases}`);
  lines.push(`Passed: ${report.coverage.passed}`);
  lines.push(`Failed: ${report.coverage.failed}`);
  lines.push(`Errors: ${report.coverage.errors}`);
  lines.push(`Pass Rate: ${report.coverage.passRate.toFixed(1)}%`);
  lines.push(`Categories: ${report.coverage.categoriesCovered.join(", ")}`);
  lines.push("");

  // Performance
  lines.push("─".repeat(60));
  lines.push("PERFORMANCE");
  lines.push("─".repeat(60));
  lines.push(`Total Evaluations: ${report.performance.totalEvaluations}`);
  lines.push(`Average Time: ${report.performance.averageTimeMs.toFixed(2)}ms`);
  lines.push(`Min Time: ${report.performance.minTimeMs.toFixed(2)}ms`);
  lines.push(`Max Time: ${report.performance.maxTimeMs.toFixed(2)}ms`);
  lines.push(`P50 Time: ${report.performance.p50TimeMs.toFixed(2)}ms`);
  lines.push(`P95 Time: ${report.performance.p95TimeMs.toFixed(2)}ms`);
  lines.push(`P99 Time: ${report.performance.p99TimeMs.toFixed(2)}ms`);
  lines.push("");

  // Budget violations
  if (report.budgetViolations.length > 0) {
    lines.push("─".repeat(60));
    lines.push("BUDGET VIOLATIONS");
    lines.push("─".repeat(60));
    for (const violation of report.budgetViolations) {
      const icon = violation.severity === "error" ? "✗" : "⚠";
      lines.push(
        `${icon} ${violation.testName}: ${violation.metric} = ${violation.actual.toFixed(2)}ms (budget: ${violation.budget}ms)`
      );
    }
    lines.push("");
  }

  // Failures
  if (report.failures.length > 0) {
    lines.push("─".repeat(60));
    lines.push("FAILURES");
    lines.push("─".repeat(60));
    for (const failure of report.failures) {
      lines.push(`✗ [${failure.packName}] ${failure.testName}`);
      lines.push(`  Expected: ${failure.expected}`);
      lines.push(`  Actual: ${failure.actual}`);
      if (failure.reason) {
        lines.push(`  Reason: ${failure.reason}`);
      }
      lines.push("");
    }
  }

  // Pack results summary
  lines.push("─".repeat(60));
  lines.push("TEST PACK RESULTS");
  lines.push("─".repeat(60));
  for (const [packName, result] of report.packResults) {
    const status = result.failedTests === 0 ? "✓" : "✗";
    lines.push(`${status} ${packName}: ${result.passedTests}/${result.totalTests} (${result.durationMs}ms)`);
  }

  lines.push("");
  lines.push("═".repeat(60));

  return lines.join("\n");
}

/**
 * Format test run report as JSON for CI integration
 */
export function formatReportAsJson(report: TestRunReport): string {
  const serializable = {
    ...report,
    packResults: Object.fromEntries(report.packResults),
  };
  return JSON.stringify(serializable, null, 2);
}

/**
 * Format test run report as JUnit XML for CI systems
 */
export function formatReportAsJUnit(report: TestRunReport): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="Policy Tests" tests="${report.coverage.totalTestCases}" failures="${report.coverage.failed}" errors="${report.coverage.errors}" time="${(report.durationMs / 1000).toFixed(3)}">`
  );

  for (const [packName, result] of report.packResults) {
    lines.push(
      `  <testsuite name="${escapeXml(packName)}" tests="${result.totalTests}" failures="${result.failedTests}" errors="${result.errorTests}" time="${(result.durationMs / 1000).toFixed(3)}">`
    );

    for (const testResult of result.testResults) {
      const testName = escapeXml(testResult.testCaseName);
      const time = (testResult.durationMs / 1000).toFixed(3);

      if (testResult.passed) {
        lines.push(`    <testcase name="${testName}" time="${time}" />`);
      } else {
        lines.push(`    <testcase name="${testName}" time="${time}">`);
        lines.push(
          `      <failure message="${escapeXml(testResult.failureReason || "Assertion failed")}" type="AssertionError">`
        );
        lines.push(
          `Effect: ${escapeXml(testResult.simulatorResult.decision.effect)}, Allowed: ${testResult.simulatorResult.decision.allowed}`
        );
        lines.push(`      </failure>`);
        lines.push(`    </testcase>`);
      }
    }

    lines.push(`  </testsuite>`);
  }

  lines.push(`</testsuites>`);

  return lines.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a policy test runner
 */
export function createPolicyTestRunner(
  simulator: IPolicySimulator,
  repository?: ITestCaseRepository,
  config?: Partial<TestRunnerConfig>
): PolicyTestRunner {
  return new PolicyTestRunner(simulator, repository, config);
}
