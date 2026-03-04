#!/usr/bin/env tsx
/**
 * Policy Test CLI
 *
 * Command-line interface for running policy tests in CI.
 *
 * Usage:
 *   tsx src/cli/test-policy.ts [command] [options]
 *
 * Commands:
 *   all         Run all golden test packs
 *   regression  Run regression tests only (default)
 *   pack <name> Run a specific test pack
 *
 * Options:
 *   --verbose, -v       Verbose output
 *   --json              Output as JSON
 *   --junit             Output as JUnit XML
 *   --fail-on-budget    Fail if performance budgets are violated
 *   --no-performance    Skip performance tests
 *   --output <file>     Write report to file
 *
 * Examples:
 *   tsx src/cli/test-policy.ts regression
 *   tsx src/cli/test-policy.ts all --verbose
 *   tsx src/cli/test-policy.ts pack "RBAC Test Pack" --json
 *   tsx src/cli/test-policy.ts all --junit --output test-results.xml
 */

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import {
  formatReportAsJson,
  formatReportAsJUnit,
  formatReportAsText,
  PolicySimulatorService,
  PolicyTestRunner,
  type TestRunnerConfig,
  type TestRunReport,
} from "../services/platform/policy-rules/testing/index.js";

// ============================================================================
// CLI Arguments
// ============================================================================

interface CliOptions {
  verbose: boolean;
  json: boolean;
  junit: boolean;
  failOnBudget: boolean;
  noPerformance: boolean;
  output?: string;
}

function parseCliArgs(): { command: string; packName?: string; options: CliOptions } {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      verbose: { type: "boolean", short: "v", default: false },
      json: { type: "boolean", default: false },
      junit: { type: "boolean", default: false },
      "fail-on-budget": { type: "boolean", default: false },
      "no-performance": { type: "boolean", default: false },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const command = positionals[0] || "regression";
  const packName = command === "pack" ? positionals[1] : undefined;

  return {
    command,
    packName,
    options: {
      verbose: values.verbose as boolean,
      json: values.json as boolean,
      junit: values.junit as boolean,
      failOnBudget: values["fail-on-budget"] as boolean,
      noPerformance: values["no-performance"] as boolean,
      output: values.output as string | undefined,
    },
  };
}

function printHelp(): void {
  console.log(`
Policy Test CLI - Run policy engine tests

Usage:
  tsx src/cli/test-policy.ts [command] [options]

Commands:
  all             Run all golden test packs
  regression      Run regression tests only (default)
  pack <name>     Run a specific test pack

Options:
  -v, --verbose       Verbose output
  --json              Output as JSON
  --junit             Output as JUnit XML
  --fail-on-budget    Fail if performance budgets are violated
  --no-performance    Skip performance tests
  -o, --output <file> Write report to file
  -h, --help          Show this help

Examples:
  tsx src/cli/test-policy.ts regression
  tsx src/cli/test-policy.ts all --verbose
  tsx src/cli/test-policy.ts pack "RBAC Test Pack" --json
  tsx src/cli/test-policy.ts all --junit --output test-results.xml
`);
}

// ============================================================================
// Mock Dependencies for CLI
// ============================================================================

/**
 * Create a mock policy store for CLI testing
 * In production, this would connect to the actual database
 */
function createMockPolicyStore() {
  const policies = new Map<string, any>();

  // Initialize with test policies
  policies.set("rbac-basic", {
    id: "rbac-basic",
    name: "Basic RBAC Policy",
    version: 1,
    priority: 100,
    rules: [
      {
        id: "admin-allow-all",
        effect: "allow",
        subjects: [{ roles: ["admin"] }],
        actions: ["*"],
        resources: ["*"],
      },
      {
        id: "user-read",
        effect: "allow",
        subjects: [{ roles: ["user"] }],
        actions: ["read"],
        resources: ["document"],
      },
    ],
  });

  return {
    async getById(policyId: string) {
      return policies.get(policyId);
    },
    async getActivePoliciesForTenant(_tenantId: string) {
      return Array.from(policies.values());
    },
  };
}

/**
 * Create a mock evaluator for CLI testing
 */
function createMockEvaluator(policyStore: ReturnType<typeof createMockPolicyStore>) {
  return {
    async evaluate(input: { subject: any; resource: any; action: any; tenantId: string }) {
      const startTime = performance.now();
      const policies = await policyStore.getActivePoliciesForTenant(input.tenantId);

      const matchedRules: Array<{ policyId: string; ruleId: string; effect: string }> = [];
      let decision: "allow" | "deny" = "deny";

      for (const policy of policies) {
        for (const rule of policy.rules) {
          // Simple role-based matching
          const roleMatch =
            rule.subjects[0].roles &&
            (rule.subjects[0].roles.includes("*") ||
              rule.subjects[0].roles.some((r: string) => input.subject.roles?.includes(r)));

          const actionMatch =
            rule.actions.includes("*") || rule.actions.includes(input.action.name);
          const resourceMatch =
            rule.resources.includes("*") || rule.resources.includes(input.resource.type);

          if (roleMatch && actionMatch && resourceMatch) {
            matchedRules.push({
              policyId: policy.id,
              ruleId: rule.id,
              effect: rule.effect,
            });

            if (rule.effect === "allow") {
              decision = "allow";
            } else if (rule.effect === "deny") {
              decision = "deny";
              break;
            }
          }
        }
      }

      return {
        decision: matchedRules.length > 0 ? decision : "deny",
        matchedRules,
        obligations: [],
        advice: [],
        evaluationTimeMs: performance.now() - startTime,
      };
    },
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const { command, packName, options } = parseCliArgs();

  // Create test infrastructure
  const policyStore = createMockPolicyStore();
  const evaluator = createMockEvaluator(policyStore);
  const simulator = new PolicySimulatorService(
    undefined as any,
    evaluator as any,
    {} as any
  );

  const runnerConfig: Partial<TestRunnerConfig> = {
    verbose: options.verbose,
    failOnBudgetViolation: options.failOnBudget,
    runPerformanceTests: !options.noPerformance,
  };

  const testRunner = new PolicyTestRunner(simulator, undefined, runnerConfig);

  // Run tests
  let report: TestRunReport;

  if (options.verbose) {
    console.log(`Running policy tests: ${command}${packName ? ` (${packName})` : ""}\n`);
  }

  switch (command) {
    case "all":
      report = await testRunner.runAllGoldenTests();
      break;

    case "regression":
      report = await testRunner.runRegressionTests();
      break;

    case "pack": {
      if (!packName) {
        console.error("Error: pack name required");
        process.exit(1);
      }
      const packResult = await testRunner.runGoldenTestPack(packName);
      if (!packResult) {
        console.error(`Error: pack "${packName}" not found`);
        process.exit(1);
      }
      // Wrap single pack result in a report
      report = {
        runAt: new Date(),
        durationMs: packResult.durationMs,
        success: packResult.failedTests === 0,
        coverage: {
          testPacksRun: 1,
          totalTestCases: packResult.totalTests,
          passed: packResult.passedTests,
          failed: packResult.failedTests,
          errors: 0,
          skipped: packResult.skippedTests,
          passRate: (packResult.passedTests / packResult.totalTests) * 100,
          categoriesCovered: [packName],
          scenariosCovered: packResult.testResults.map((r: any) => r.testCaseName),
        },
        performance: {
          totalEvaluations: packResult.totalTests,
          totalTimeMs: packResult.durationMs,
          averageTimeMs: packResult.durationMs / packResult.totalTests,
          minTimeMs: Math.min(...packResult.testResults.map((r: any) => r.durationMs)),
          maxTimeMs: Math.max(...packResult.testResults.map((r: any) => r.durationMs)),
          p50TimeMs: 0,
          p95TimeMs: 0,
          p99TimeMs: 0,
          budgetViolations: [],
        },
        packResults: new Map([[packName, packResult]]),
        failures: packResult.testResults
          .filter((r) => !r.passed)
          .map((r) => ({
            packName,
            testName: r.testCaseName,
            expected: r.assertionResults?.[0]?.expected != null ? String(r.assertionResults[0].expected) : "unknown",
            actual: String(r.simulatorResult.decision),
            reason: r.failureReason,
          })),
        budgetViolations: [],
      };
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }

  // Format output
  let output: string;
  if (options.json) {
    output = formatReportAsJson(report);
  } else if (options.junit) {
    output = formatReportAsJUnit(report);
  } else {
    output = formatReportAsText(report);
  }

  // Write output
  if (options.output) {
    writeFileSync(options.output, output);
    console.log(`Report written to: ${options.output}`);
  } else {
    console.log(output);
  }

  // Exit code
  if (!report.success) {
    process.exit(1);
  }

  if (options.failOnBudget && report.budgetViolations.some((v) => v.severity === "error")) {
    console.error("\nFailed due to performance budget violations");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
