import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./candidate.mjs";

test("retired QA preparation fails before inspecting files or changing infrastructure", async () => {
  await assert.rejects(
    main(["qa-prepare", "/nonexistent/candidate"]),
    /TENANT_QA_IMPORT_RETIRED/,
  );
});
