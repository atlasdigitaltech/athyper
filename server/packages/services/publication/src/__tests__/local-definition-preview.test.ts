import { LocalBusinessPartnerDefinitionConsumer } from "../business-partner-definition-consumer.js";
import { afterEach, describe, it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, generateKeyPairSync } from "node:crypto";
import { createBusinessPartnerFoundationDefinition } from "../business-partner-foundation-definition.js";
import {
  assertCosmeticDefinitionChange,
  localPreviewRoot,
  saveLocalDefinitionPreview,
  overlayLocalDefinitionPreview,
} from "../local-definition-preview.js";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  delete process.env.ATHYPER_LOCAL_PREVIEW_ROOT;
  delete process.env.ATHYPER_LOCAL_WORKSPACE;
  delete process.env.ATHYPER_DOMAIN_SUFFIX;
  delete process.env.ATHYPER_ENV;
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "bp-preview-"));
  roots.push(root);
  const pair = generateKeyPairSync("ed25519");
  writeFileSync(
    join(root, "private.pem"),
    pair.privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  writeFileSync(
    join(root, "public.pem"),
    pair.publicKey.export({ format: "pem", type: "spki" }),
  );
  const bundle = createBusinessPartnerFoundationDefinition({
    request: "1".repeat(64),
    eligibility: "2".repeat(64),
    meshProfile: "3".repeat(64),
    meshMatch: "4".repeat(64),
  });
  const baseline: any = {
    id: "12000000-0000-4000-8000-000000000001",
    tenantId: "12000000-0000-4000-8000-000000000002",
    revisionId: "12000000-0000-4000-8000-000000000003",
    releaseId: "12000000-0000-4000-8000-000000000004",
    releaseNo: 20,
    publicationKey:
      "studio.business_partner.definition.business_partner.onboarding",
    plane: "neon",
    bundleCode: bundle.bundleCode,
    semanticVersion: bundle.semanticVersion,
    bundleSchemaVersion: "1.0.0",
    bundleHash: "a".repeat(64),
    bundle,
    generatedAt: "2026-09-11T00:00:00.000Z",
  };
  const next: any = structuredClone(bundle);
  next.formDescriptors.supplierRequest.sections[0].title = "Preview scope";
  const revision = {
    id: "12000000-0000-4000-8000-000000000005",
    tenantId: baseline.tenantId,
    bundleCode: bundle.bundleCode,
    bundle: next,
    createdAt: "2026-09-11T01:00:00.000Z",
  };
  Object.assign(process.env, {
    ATHYPER_LOCAL_PREVIEW_ROOT: root,
    ATHYPER_LOCAL_WORKSPACE: "1",
    ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
    ATHYPER_ENV: "local",
  });
  return { root, baseline, revision };
}
describe("isolated cosmetic metadata preview", () => {
  it("activates reordered fields and layout without changing operation coordinates", async () => {
    const { root, baseline, revision } = fixture();
    revision.bundle.formDescriptors.supplierRequest.sections.reverse();
    const fields =
      revision.bundle.formDescriptors.supplierRequest.sections.find(
        (section: any) => section.fields.length,
      ).fields;
    fields.reverse();
    fields[0].columnSpan = 6;
    expect(
      (await saveLocalDefinitionPreview(root, revision, baseline)).state,
    ).toBe("active");
    const active = await overlayLocalDefinitionPreview(baseline);
    expect(active.bundle.formDescriptors).toEqual(
      revision.bundle.formDescriptors,
    );
    expect(await overlayLocalDefinitionPreview(baseline, "request")).toEqual(
      baseline,
    );
  });

  it("uses preview workflow stages and preserves their hash across presentation edits", async () => {
    const { root, baseline, revision } = fixture();
    revision.bundle.workflowDefinitions.supplier.stages[0].slaMinutes = 75;
    const consumer = new LocalBusinessPartnerDefinitionConsumer({
      local: { findActiveBusinessPartnerDefinition: async () => baseline },
      canonicalizer: {
        canonicalBytes: (value) => Buffer.from(JSON.stringify(value)),
        sha256: (value) => createHash("sha256").update(value).digest("hex"),
      },
    });
    const before = await consumer.workflow({ kind: "add_supplier" });
    expect(
      (await saveLocalDefinitionPreview(root, revision, baseline)).state,
    ).toBe("active");
    const after = await consumer.workflow({ kind: "add_supplier" });
    expect(after.stages[0].slaMinutes).toBe(75);
    expect(after.hash).not.toBe(before.hash);
    revision.id = "12000000-0000-4000-8000-000000000008";
    revision.bundle.formDescriptors.supplierRequest.title =
      "Another presentation save";
    await saveLocalDefinitionPreview(root, revision, baseline);
    expect((await consumer.workflow({ kind: "add_supplier" })).hash).toBe(
      after.hash,
    );
  });

  it("enforces narrowed source mappings in the native request consumer", async () => {
    const { root, baseline, revision } = fixture();
    revision.bundle.requestSchemas["supplier.new"].supportedSources = [
      "internal",
    ];
    expect(
      (await saveLocalDefinitionPreview(root, revision, baseline)).state,
    ).toBe("active");
    const consumer = new LocalBusinessPartnerDefinitionConsumer({
      local: { findActiveBusinessPartnerDefinition: async () => baseline },
      canonicalizer: {
        canonicalBytes: (value) => Buffer.from(JSON.stringify(value)),
        sha256: (value) => createHash("sha256").update(value).digest("hex"),
      },
    });
    await expect(
      consumer.requestSchema({
        kind: "new_partner",
        requestedRole: "supplier",
        sourceKind: "import",
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_DEFINITION_SOURCE_MAPPING_MISSING",
    });
    await expect(
      consumer.requestSchema({
        kind: "new_partner",
        requestedRole: "supplier",
        sourceKind: "manual",
      }),
    ).resolves.toHaveProperty("hash");
  });

  it("rejects SoD weakening, malformed workflow configuration and changed field bindings", async () => {
    const { root, baseline, revision } = fixture();
    for (const mutate of [
      (bundle: any) => {
        bundle.workflowDefinitions.supplier.sod.makerCannotDecide = false;
      },
      (bundle: any) => {
        bundle.workflowDefinitions.supplier.stages[0].quorum = {
          kind: "percentage",
          value: 101,
        };
      },
      (bundle: any) => {
        bundle.workflowDefinitions.supplier.stages[0].approverPrincipalIds = [
          "injected",
        ];
      },
      (bundle: any) => {
        bundle.formDescriptors.supplierRequest.sections[0].fields[0].path =
          "other";
      },
    ]) {
      const next = structuredClone(revision);
      mutate(next.bundle);
      expect(
        (await saveLocalDefinitionPreview(root, next, baseline)).state,
      ).toBe("failed");
    }
  });
  it("changes presentation without changing request definition coordinates", async () => {
    const { root, baseline, revision } = fixture();
    const consumer = new LocalBusinessPartnerDefinitionConsumer({
      local: { findActiveBusinessPartnerDefinition: async () => baseline },
      canonicalizer: {
        canonicalBytes: (value) => Buffer.from(JSON.stringify(value)),
        sha256: (value) => createHash("sha256").update(value).digest("hex"),
      },
    });
    const before = await consumer.requestSchema({
      kind: "new_partner",
      requestedRole: "supplier",
      sourceKind: "manual",
    });
    await saveLocalDefinitionPreview(root, revision, baseline);
    const after = await consumer.requestSchema({
      kind: "new_partner",
      requestedRole: "supplier",
      sourceKind: "manual",
    });
    expect(after).toEqual(before);
    expect((await consumer.descriptors()).revisionId).toBe(revision.id);
  });

  it("rejects enablement in QA and without an explicit local workspace", () => {
    expect(() =>
      localPreviewRoot({
        ATHYPER_LOCAL_PREVIEW_ROOT: "/tmp",
        ATHYPER_DOMAIN_SUFFIX: "qa.athyper.test",
      }),
    ).toThrow(/ENVIRONMENT/);
    expect(localPreviewRoot({})).toBeUndefined();
  });
  it("uses native compilation and signature verification, then exposes the changed descriptor", async () => {
    const { root, baseline, revision } = fixture();
    const status = await saveLocalDefinitionPreview(root, revision, baseline);
    expect(status.state).toBe("active");
    const active = await overlayLocalDefinitionPreview(baseline);
    expect(active.revisionId).toBe(revision.id);
    expect(
      (active.bundle.formDescriptors.supplierRequest as any).sections[0].title,
    ).toBe("Preview scope");
    expect(baseline.releaseNo).toBe(20);
  });
  it("retains the prior active revision when an authorization change is rejected", async () => {
    const { root, baseline, revision } = fixture();
    expect(
      (await saveLocalDefinitionPreview(root, revision, baseline)).state,
    ).toBe("active");
    const bad = structuredClone(revision);
    bad.id = "12000000-0000-4000-8000-000000000006";
    bad.bundle.fieldPolicies = {};
    expect((await saveLocalDefinitionPreview(root, bad, baseline)).state).toBe(
      "failed",
    );
    expect((await overlayLocalDefinitionPreview(baseline)).revisionId).toBe(
      revision.id,
    );
  });
  it("rejects changed keys, forged artifacts, stale baselines and cross-tenant sources", async () => {
    const { root, baseline, revision } = fixture();
    expect(
      (
        await saveLocalDefinitionPreview(
          root,
          { ...revision, tenantId: "12000000-0000-4000-8000-000000000009" },
          baseline,
        )
      ).state,
    ).toBe("failed");
    await saveLocalDefinitionPreview(root, revision, baseline);
    await expect(
      overlayLocalDefinitionPreview({
        ...baseline,
        bundleHash: "b".repeat(64),
      }),
    ).rejects.toThrow(/STALE/);
    const path = join(
      root,
      readdirSync(root).find((f) => f.endsWith(".active.json"))!,
    );
    const saved = JSON.parse(readFileSync(path, "utf8"));
    saved.document.envelope.payload.bundle.fieldPolicies = {};
    writeFileSync(path, JSON.stringify(saved));
    await expect(overlayLocalDefinitionPreview(baseline)).rejects.toThrow(
      /HASH/,
    );
  });
  it("does not let an older verification replace a newer saved revision", async () => {
    const { root, baseline, revision } = fixture();
    let resolveBaseline!: (value: any) => void;
    const older = saveLocalDefinitionPreview(
      root,
      revision,
      () =>
        new Promise((resolve) => {
          resolveBaseline = resolve;
        }),
    );
    const newer = {
      ...revision,
      id: "12000000-0000-4000-8000-000000000007",
      createdAt: "2026-09-11T02:00:00.000Z",
    };
    expect(
      (await saveLocalDefinitionPreview(root, newer, baseline)).state,
    ).toBe("active");
    resolveBaseline(baseline);
    expect((await older).state).toBe("superseded");
    expect((await overlayLocalDefinitionPreview(baseline)).revisionId).toBe(
      newer.id,
    );
  });
  it("rejects binding, workflow and structural changes", () => {
    for (const changed of [
      { fields: [] },
      { workflowDefinitions: {} },
      { formDescriptors: {} },
    ])
      expect(() =>
        assertCosmeticDefinitionChange(
          {
            fields: [1],
            workflowDefinitions: { a: 1 },
            formDescriptors: { x: 1 },
          },
          {
            fields: [1],
            workflowDefinitions: { a: 1 },
            formDescriptors: { x: 1 },
            ...changed,
          },
        ),
      ).toThrow(/QUALIFICATION/);
  });
});
