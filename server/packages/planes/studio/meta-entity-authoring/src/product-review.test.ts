import { resolveSourcePath } from "../../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type {
  MetaEntityAuthoringRepository,
  MetaEntityChangeSet,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseTableEntityProduct,
  compileTableEntityProduct,
} from "./authoring/table-product.js";
import { compileGraph, sha256 } from "./deterministic.js";
import {
  createProductReviewService,
  type ProductReviewReceipt,
} from "./product-review.js";
function fixture() {
  const product = parseTableEntityProduct(
    JSON.parse(
      readFileSync(
        resolveSourcePath(new URL(
          "../../../../../../metadata/entities/address/definition.json",
          import.meta.url,
        )),
        "utf8",
      ),
    ),
  );
  const { graph } = compileTableEntityProduct(product, "neon");
  graph.surfaces!.find(
    (s) => s.surfaceKind === "list",
  )!.layoutConfig!.tableEntityProduct = {
    schema: "athyper.table-entity-source/1",
    productHash: sha256(product),
    targetPlanes: ["neon"],
    moduleCode: product.moduleCode,
  };
  let cs = {
    id: randomUUID(),
    tenantId: null,
    entityId: randomUUID(),
    entityCode: "address",
    revision: 1,
    status: "draft",
    createdBy: "seed",
    submittedBy: null,
  } as unknown as MetaEntityChangeSet;
  const receipts: ProductReviewReceipt[] = [];
  const repository = {
    get: async () => ({ ...cs }),
    loadGraph: async () => graph,
    transition: vi.fn(async (input) => {
      cs = {
        ...cs,
        revision: cs.revision + 1,
        status: input.to,
        ...(input.to === "in_review"
          ? { submittedBy: input.actorId }
          : { approvedBy: input.actorId }),
      };
      return cs;
    }),
  } as unknown as MetaEntityAuthoringRepository;
  const matches = (
    action: string,
    id: string,
    revision: number,
    hash: string,
    actor: string,
  ) =>
    Promise.resolve(
      receipts.some(
        (r) =>
          r.action === action &&
          r.changeSetId === id &&
          r.expectedRevision === revision &&
          r.expectedContractHash === hash &&
          r.actorId === actor,
      ),
    );
  const record = vi.fn(async (r: ProductReviewReceipt) => {
    receipts.push(r);
  });
  const service = createProductReviewService({
    repository,
    receipt: async (id) => receipts.find((r) => r.requestId === id) ?? null,
    adopted: (...a) => matches("adopt", ...a),
    submitted: (...a) => matches("submit", ...a),
    record,
  });
  const command = () => ({
    requestId: randomUUID(),
    expectedRevision: cs.revision,
    expectedContractHash: compileGraph(graph).contractHash,
  });
  return {
    service,
    command,
    graph,
    receipts,
    record,
    repository,
    get cs() {
      return cs;
    },
    set cs(x: MetaEntityChangeSet) {
      cs = x;
    },
  };
}
it("adopts without relabeling seed provenance, submits and independently approves the exact graph", async () => {
  const f = fixture();
  await f.service.execute(f.cs.id, "admin", "adopt", f.command());
  expect(f.cs.createdBy).toBe("seed");
  expect(f.cs.revision).toBe(1);
  await f.service.execute(f.cs.id, "admin", "submit", f.command());
  expect(f.cs.submittedBy).toBe("admin");
  await f.service.execute(f.cs.id, "owner", "approve", f.command());
  expect(f.cs.status).toBe("approved");
  expect(f.cs.createdBy).toBe("seed");
  expect(f.receipts).toHaveLength(3);
});
it("denies submission without exact human adoption and denies self review", async () => {
  const f = fixture();
  await expect(
    f.service.execute(f.cs.id, "admin", "submit", f.command()),
  ).rejects.toMatchObject({ code: "ADOPTION_REQUIRED" });
  await f.service.execute(f.cs.id, "admin", "adopt", f.command());
  await f.service.execute(f.cs.id, "admin", "submit", f.command());
  await expect(
    f.service.execute(f.cs.id, "admin", "approve", f.command()),
  ).rejects.toMatchObject({ code: "REVIEWER_SEPARATION_REQUIRED" });
  expect(f.cs.status).toBe("in_review");
});
it("requires the same actor to adopt and submit", async () => {
  const f = fixture();
  await f.service.execute(f.cs.id, "admin", "adopt", f.command());
  await expect(
    f.service.execute(f.cs.id, "another", "submit", f.command()),
  ).rejects.toMatchObject({ code: "ADOPTION_REQUIRED" });
});
it("rejects changed hashes and stale revisions before recording a receipt", async () => {
  const f = fixture();
  await expect(
    f.service.execute(f.cs.id, "admin", "adopt", {
      ...f.command(),
      expectedContractHash: "0".repeat(64),
    }),
  ).rejects.toThrow();
  await expect(
    f.service.execute(f.cs.id, "admin", "adopt", {
      ...f.command(),
      expectedRevision: 0,
    }),
  ).rejects.toThrow();
  expect(f.record).not.toHaveBeenCalled();
});
it("replays an exact idempotency key but rejects rebinding it to another actor or action", async () => {
  const f = fixture(),
    c = f.command();
  const r = await f.service.execute(f.cs.id, "admin", "adopt", c);
  expect(await f.service.execute(f.cs.id, "admin", "adopt", c)).toEqual(r);
  expect(f.record).toHaveBeenCalledTimes(1);
  await expect(f.service.execute(f.cs.id, "owner", "adopt", c)).rejects.toThrow(
    "Idempotency",
  );
  await expect(
    f.service.execute(f.cs.id, "admin", "submit", c),
  ).rejects.toThrow("Idempotency");
});
it("rejects tenant sources and malformed target declarations", async () => {
  const f = fixture();
  f.cs = { ...f.cs, tenantId: randomUUID() };
  await expect(f.service.inspect(f.cs.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it("does not transition when receipt persistence fails", async () => {
  const f = fixture();
  await f.service.execute(f.cs.id, "admin", "adopt", f.command());
  f.record.mockRejectedValueOnce(new Error("audit unavailable"));
  await expect(
    f.service.execute(f.cs.id, "admin", "submit", f.command()),
  ).rejects.toThrow("audit unavailable");
  expect(f.repository.transition).not.toHaveBeenCalled();
});

it("rejects an adopter as reviewer even if another actor submitted", async () => {
  const f = fixture();
  await f.service.execute(f.cs.id, "admin", "adopt", f.command());
  await f.service.execute(f.cs.id, "dual-role", "adopt", f.command());
  await f.service.execute(f.cs.id, "admin", "submit", f.command());
  await expect(
    f.service.execute(f.cs.id, "dual-role", "approve", f.command()),
  ).rejects.toMatchObject({ code: "REVIEWER_SEPARATION_REQUIRED" });
});
