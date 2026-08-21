import { describe, expectTypeOf, it } from "vitest";
import type { ObjectStorage } from "../index.js";
describe("object-storage contract API", () => { it("exposes narrow object operations without S3 types", () => { expectTypeOf<ObjectStorage>().toHaveProperty("put"); expectTypeOf<ObjectStorage>().toHaveProperty("createDownloadUrl"); expectTypeOf<ObjectStorage>().toHaveProperty("createUploadUrl"); expectTypeOf<ObjectStorage>().toHaveProperty("copy"); }); });
