import type { TestModule } from "vitest/node";
import type { Reporter } from "vitest/reporters";

export class NoSkippedPostgresReporter implements Reporter {
  onTestRunEnd(modules: readonly TestModule[]): void {
    if (process.env["ATHYPER_POSTGRES_LOCAL_SKIP"] === "true") return;
    const skipped = modules.flatMap((module) => [...module.children.allTests("skipped")]);
    if (skipped.length > 0) {
      const names = skipped.map((test) => test.fullName).join(", ");
      throw new Error(`Required PostgreSQL qualification skipped ${skipped.length} integration test(s): ${names}`);
    }
  }
}
