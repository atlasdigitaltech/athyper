import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const studio = readFileSync(resolve(import.meta.dirname, "../../../routes/studio-version.route.ts"), "utf8");
const compiler = readFileSync(resolve(import.meta.dirname, "../../entity-compiler.service.ts"), "utf8");

describe("execution descriptor activation boundary", () => {
  it("validates the selected version before the EFFECTIVE transaction", () => {
    const handlerStart = studio.indexOf("const approveHandler: RequestHandler");
    const transaction = studio.indexOf("await db.transaction().execute", handlerStart);
    const validation = studio.indexOf("await deps.validateEntityVersionActivation?.(id)", handlerStart);
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(validation).toBeGreaterThan(handlerStart);
    expect(validation).toBeLessThan(transaction);
    expect(studio).toContain('error: "METADATA_ACTIVATION_INVALID"');
    expect(studio).toContain("error.diagnostics");
  });

  it("compiles the exact candidate version and emits owned diagnostics", () => {
    expect(compiler).toContain("validateVersionForActivation(versionId: string)");
    expect(compiler).toContain("this.fullCompile(entityCode, versionId)");
    expect(compiler).toContain('"entity_activation_validation_failed"');
    expect(compiler).toContain("diagnostics: err.diagnostics");
  });
});
