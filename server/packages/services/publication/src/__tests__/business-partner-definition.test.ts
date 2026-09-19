import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import {
  PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
  PUBLICATION_ARTIFACT_SCHEMA_V1,
} from "@athyper/server-contract-publication";
import { describe, expect, it } from "vitest";
import {
  BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS,
  compileBusinessPartnerDefinition,
  createBusinessPartnerFoundationDefinition,
  LocalBusinessPartnerDefinitionConsumer,
  LocalMeshBusinessPartnerDefinitionConsumer,
  parseBusinessPartnerDefinitionBundle,
  simulateBusinessPartnerDefinition,
  VerifiedPublicationArtifactLoader,
} from "../index.js";

const hashes = {
  request: "1".repeat(64),
  eligibility: "2".repeat(64),
  meshProfile: "3".repeat(64),
  meshMatch: "4".repeat(64),
} as const;
describe("WP12 Business Partner definitions", () => {
  it("provides every P6 journey, source, policy and descriptor without instance data", () => {
    const bundle = createBusinessPartnerFoundationDefinition(hashes);
    expect(parseBusinessPartnerDefinitionBundle(bundle)).toEqual(bundle);
    for (const key of BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS)
      expect(bundle.requestSchemas).toHaveProperty(key);
    for (const source of ["internal", "portal", "mesh", "import", "api"])
      expect(bundle.mappingContracts).toHaveProperty(source);
    expect(bundle).toMatchObject({
      fieldPolicies: {
        organization: expect.anything(),
      },
      workflowDefinitions: {
        supplier: expect.anything(),
        customer: expect.anything(),
      },
      meshSafeSchemas: { organizationProfile: expect.anything() },
      formDescriptors: {
        supplierRequest: {
          schema: "athyper.business-partner-request-form/1",
          sections: expect.arrayContaining([
            expect.objectContaining({ key: "scope" }),
            expect.objectContaining({ key: "identity" }),
          ]),
        },
      },
    });
    expect(JSON.stringify(bundle)).not.toMatch(
      /accountNumber|routingNumber|taxIdentifierValue|partnerInstance/,
    );
  });
  it("publishes the locked Phase 1 360 manifest with explicit risk exclusion", () => {
    const bundle = createBusinessPartnerFoundationDefinition(hashes),
      descriptor = bundle.viewDescriptors["neonPartner360"] as Record<
        string,
        unknown
      >,
      codes = [
        "overview",
        "identity",
        "contacts",
        "addresses",
        "identifiers-tax",
        "roles-scope",
        "supplier-company",
        "customer-company",
        "banking",
        "qualifications-certificates",
        "credit",
        "requests",
        "activity",
        "business-activity",
        "network",
      ],
      packCodes = [
        "organization_base",
        "supplier_scope",
        "supplier_payable",
        "customer_scope",
        "customer_credit",
      ];
    expect(descriptor).toMatchObject({
      version: "1.0.0",
      schemaVersion: 1,
      excludedCapabilities: ["risk"],
    });
    expect(
      (descriptor["sections"] as readonly { code: string }[]).map(
        (section) => section.code,
      ),
    ).toEqual(codes);
    expect(
      (
        descriptor["completenessPacks"] as readonly {
          code: string;
          requirements: readonly unknown[];
        }[]
      ).map((pack) => pack.code),
    ).toEqual(packCodes);
    expect(
      (
        descriptor["completenessPacks"] as readonly {
          requirements: readonly unknown[];
        }[]
      ).every((pack) => pack.requirements.length > 0),
    ).toBe(true);
    expect(JSON.stringify(descriptor)).not.toMatch(
      /"(?:riskAssessment|riskScore|riskBand|riskIncidentCount|riskTrend|riskExposure)"\s*:/,
    );
  });
  it("rejects sensitive instance fields from a definition", () => {
    const bundle = {
      ...createBusinessPartnerFoundationDefinition(hashes),
      formDescriptors: { bankAccount: { value: "x" } },
    };
    expect(() => parseBusinessPartnerDefinitionBundle(bundle)).toThrowError(
      /INSTANCE_DATA_FORBIDDEN/,
    );
  });
  it("verifies an Ed25519-signed compiled definition and emits bundle-specific evidence", async () => {
    const source = createBusinessPartnerFoundationDefinition(hashes),
      canonicalBytes = (value: unknown) =>
        new TextEncoder().encode(JSON.stringify(value)),
      sha256 = (value: Uint8Array) =>
        createHash("sha256").update(value).digest("hex"),
      compiled = compileBusinessPartnerDefinition({
        bundle: source,
        plane: "neon",
        canonicalizer: { canonicalBytes, sha256 },
      }),
      payload = {
        id: "12000000-0000-4000-8000-000000000001",
        tenantId: "12000000-0000-4000-8000-000000000002",
        revisionId: "12000000-0000-4000-8000-000000000003",
        releaseId: "12000000-0000-4000-8000-000000000004",
        releaseNo: 1,
        publicationKey:
          "studio.business_partner.definition.business_partner.onboarding",
        plane: "neon" as const,
        bundleCode: source.bundleCode,
        semanticVersion: source.semanticVersion,
        bundleSchemaVersion: "1.0.0",
        bundleHash: compiled.compiledBundleHash,
        sourceBundleHash: compiled.sourceBundleHash,
        bundle: compiled.bundle,
        compileReport: compiled.report,
        generatedAt: "2026-08-28T00:00:00.000Z",
      },
      envelope = {
        schema: PUBLICATION_ARTIFACT_SCHEMA_V1,
        publicationKey: payload.publicationKey,
        releaseId: payload.releaseId,
        releaseNo: 1,
        releaseKind: "publish" as const,
        targetPlane: "neon" as const,
        artifactKind: "business_partner_definition_bundle" as const,
        generatedAt: payload.generatedAt,
        compatibilityLevel: "backward_compatible" as const,
        payload,
      },
      manifest = {
        artifactSchema: PUBLICATION_ARTIFACT_SCHEMA_V1,
        mediaType: PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
        publicationKey: payload.publicationKey,
        releaseId: payload.releaseId,
        releaseNo: 1,
        targetPlane: "neon" as const,
        artifactKind: "business_partner_definition_bundle" as const,
        payloadSha256: sha256(canonicalBytes(payload)),
        compiler: { name: "test", version: "2.0.0" },
        contractSchemaVersion: "1.0.0",
        descriptorSchemaVersion: "1.0.0",
        signatureAlgorithm: "Ed25519",
        signingKeyId: "wp12-test",
        createdAt: payload.generatedAt,
        evidence: {
          compiledBundleHash: compiled.compiledBundleHash,
          sourceBundleHash: compiled.sourceBundleHash,
          compileReportHash: sha256(canonicalBytes(compiled.report)),
        },
      },
      { privateKey, publicKey } = generateKeyPairSync("ed25519"),
      signature = sign(
        null,
        canonicalBytes({ envelope, manifest }),
        privateKey,
      ).toString("base64"),
      document = { envelope, manifest, signature },
      bytes = canonicalBytes(document),
      artifactHash = sha256(bytes),
      loader = new VerifiedPublicationArtifactLoader({
        store: { get: async () => bytes } as any,
        verifier: {
          verify: async (input) =>
            verify(
              null,
              input.bytes,
              publicKey,
              Buffer.from(input.signature, "base64"),
            ),
        },
        canonicalizer: { canonicalBytes, sha256 },
        runtimeVersion: "1.0.0",
      });
    const loaded = await loader.load({
      deploymentId: "12000000-0000-4000-8000-000000000005",
      deploymentStatus: "dispatched",
      targetPlane: "neon",
      targetEnvironment: "test",
      targetInstance: "*",
      publicationKey: payload.publicationKey,
      sourceReleaseId: payload.releaseId,
      sourceReleaseNo: 1,
      artifactUri: "s3://test/wp12.json",
      artifactHash,
      signatureAlgorithm: "Ed25519",
      signingKeyId: "wp12-test",
      signature,
    });
    expect(loaded.verification).toMatchObject({
      signatureVerified: true,
      definitionBundleHash: payload.bundleHash,
      definitionBundleSchemaVersion: "1.0.0",
    });
  });
  it("compiles deterministically and emits a person-free MESH projection", () => {
    const bundle = createBusinessPartnerFoundationDefinition(hashes),
      canonicalizer = {
        canonicalBytes: (value: unknown) =>
          new TextEncoder().encode(JSON.stringify(value)),
        sha256: (value: Uint8Array) =>
          createHash("sha256").update(value).digest("hex"),
      },
      first = compileBusinessPartnerDefinition({
        bundle,
        plane: "mesh",
        canonicalizer,
      }),
      second = compileBusinessPartnerDefinition({
        bundle,
        plane: "mesh",
        canonicalizer,
      });
    expect(first).toEqual(second);
    expect(first.report).toMatchObject({
      deterministic: true,
      compatible: true,
      plane: "mesh",
    });
    expect(Object.keys(first.bundle.requestSchemas)).toEqual([
      "mesh.organizationProfile",
      "mesh.selectiveAcceptance",
    ]);
    expect(first.bundle.fieldPolicies).not.toHaveProperty("person");
    expect(first.bundle.workflowDefinitions).toEqual({});
    expect(() =>
      compileBusinessPartnerDefinition({
        bundle,
        plane: "neon",
        canonicalizer,
        priorSemanticVersion: "3.1.1",
      }),
    ).toThrowError(/DOWNGRADE_FORBIDDEN/);
    expect(() =>
      compileBusinessPartnerDefinition({
        bundle,
        plane: "neon",
        canonicalizer,
        expectedSourceContractHashes: { request: "f".repeat(64) },
      }),
    ).toThrowError(/SOURCE_COMPATIBILITY_REJECTED/);
  });
  it("simulates every target without authoring or publication authority", () => {
    const prior = createBusinessPartnerFoundationDefinition(hashes),
      bundle = { ...prior, semanticVersion: "3.2.0" },
      canonicalizer = {
        canonicalBytes: (value: unknown) =>
          new TextEncoder().encode(JSON.stringify(value)),
        sha256: (value: Uint8Array) =>
          createHash("sha256").update(value).digest("hex"),
      },
      result = simulateBusinessPartnerDefinition({
        bundle,
        targetPlanes: ["studio", "neon", "mesh"],
        canonicalizer,
        prior: {
          revisionId: "12000000-0000-4000-8000-000000000003",
          bundle: prior,
        },
      });
    expect(result).toMatchObject({
      schema: "athyper.business-partner-definition-simulation/1",
      readOnly: true,
      publicationAuthorized: false,
      compatible: true,
      againstSemanticVersion: "3.1.1",
    });
    expect(result.planes.map((item) => item.plane)).toEqual([
      "studio",
      "neon",
      "mesh",
    ]);
    expect(
      result.planes.every((item) => item.report.deterministic === true),
    ).toBe(true);
  });
  it("rejects breaking simulation against an immutable prior revision", () => {
    const prior = createBusinessPartnerFoundationDefinition(hashes),
      bundle = { ...prior, semanticVersion: "3.2.0", requestSchemas: {} },
      canonicalizer = {
        canonicalBytes: (value: unknown) =>
          new TextEncoder().encode(JSON.stringify(value)),
        sha256: (value: Uint8Array) =>
          createHash("sha256").update(value).digest("hex"),
      };
    try {
      simulateBusinessPartnerDefinition({
        bundle,
        targetPlanes: ["neon"],
        canonicalizer,
        prior: {
          revisionId: "12000000-0000-4000-8000-000000000003",
          bundle: prior,
        },
      });
      throw new Error("expected simulation rejection");
    } catch (error) {
      expect(error).toMatchObject({
        code: "BUSINESS_PARTNER_DEFINITION_REQUIRED_SCHEMA_REMOVED",
      });
    }
  });
  it("resolves schemas and workflow only from the last active local projection while STUDIO is absent", async () => {
    const bundle = createBusinessPartnerFoundationDefinition(hashes),
      canonicalizer = {
        canonicalBytes: (value: unknown) =>
          new TextEncoder().encode(JSON.stringify(value)),
        sha256: (value: Uint8Array) =>
          createHash("sha256").update(value).digest("hex"),
      },
      compiled = compileBusinessPartnerDefinition({
        bundle,
        plane: "neon",
        canonicalizer,
      }),
      consumer = new LocalBusinessPartnerDefinitionConsumer({
        local: {
          findActiveBusinessPartnerDefinition: async () => ({
            id: "id",
            tenantId: "tenant",
            revisionId: "revision",
            releaseId: "release",
            releaseNo: 7,
            publicationKey:
              "studio.business_partner.definition.business_partner.onboarding",
            plane: "neon",
            bundleCode: bundle.bundleCode,
            semanticVersion: bundle.semanticVersion,
            bundleSchemaVersion: "1.0.0",
            bundleHash: compiled.compiledBundleHash,
            bundle: compiled.bundle,
            generatedAt: "2026-08-29T00:00:00.000Z",
          }),
        },
        canonicalizer,
      });
    await expect(
      consumer.requestSchema({
        kind: "new_partner",
        requestedRole: "supplier",
        sourceKind: "portal",
      }),
    ).resolves.toMatchObject({
      code: "neon.business_partner_request.supplier.new",
      version: 7,
    });
    await expect(
      consumer.workflow({ kind: "add_workforce" }),
    ).rejects.toMatchObject({code: "BUSINESS_PARTNER_DEFINITION_ROLE_REQUIRED"});
    await expect(
      consumer.workflow({
        kind: "new_partner",
        requestedRole: "supplier",
        proposedPayload: { ownershipClass: "internal" },
      }),
    ).resolves.toMatchObject({
      stages: [
        expect.objectContaining({ code: "stewardship", routed: true }),
        expect.objectContaining({ code: "compliance_tax", routed: false }),
        expect.objectContaining({
          code: "procurement_owner",
          routed: true,
          quorum: { kind: "percentage", value: 25 },
        }),
      ],
    });
  });
  it("resolves the MESH-safe organization schema from its local last-known-good projection", async () => {
    const bundle = createBusinessPartnerFoundationDefinition(hashes),
      canonicalizer = {
        canonicalBytes: (value: unknown) =>
          new TextEncoder().encode(JSON.stringify(value)),
        sha256: (value: Uint8Array) =>
          createHash("sha256").update(value).digest("hex"),
      },
      compiled = compileBusinessPartnerDefinition({
        bundle,
        plane: "mesh",
        canonicalizer,
      }),
      consumer = new LocalMeshBusinessPartnerDefinitionConsumer({
        local: {
          findActiveBusinessPartnerDefinition: async () => ({
            id: "id",
            tenantId: "tenant",
            revisionId: "revision",
            releaseId: "release",
            releaseNo: 9,
            publicationKey:
              "studio.business_partner.definition.business_partner.onboarding",
            plane: "mesh",
            bundleCode: bundle.bundleCode,
            semanticVersion: bundle.semanticVersion,
            bundleSchemaVersion: "1.0.0",
            bundleHash: compiled.compiledBundleHash,
            bundle: compiled.bundle,
            generatedAt: "2026-08-29T00:00:00.000Z",
          }),
        },
      });
    await expect(consumer.organizationProfileSchema()).resolves.toMatchObject({
      schemaVersion: 2,
      fieldSetCode: "recipient_safe_v2",
      releaseNo: 9,
      allowedPaths: expect.arrayContaining([
        "partner.legalName",
        "commodityCapabilities.code",
      ]),
      prohibitedPatterns: expect.arrayContaining(["person.", "workforce."]),
    });
  });
});
