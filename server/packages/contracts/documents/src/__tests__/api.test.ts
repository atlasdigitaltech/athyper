import { describe, expectTypeOf, it } from "vitest";
import type { DocumentArtifactRepository, DocumentService, DocumentTemplateRepository } from "../index.js";
describe("documents contract API", () => { it("keeps orchestration separate from persistence", () => { expectTypeOf<DocumentService>().toHaveProperty("render"); expectTypeOf<DocumentTemplateRepository<symbol>>().toHaveProperty("resolvePublished"); expectTypeOf<DocumentArtifactRepository<symbol>>().toHaveProperty("findAccessible"); }); });
