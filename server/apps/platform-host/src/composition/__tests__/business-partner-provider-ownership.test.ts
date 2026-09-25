import { readFileSync, readdirSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { MasterDataError } from "@athyper/server-service-master-data";
import { createBusinessPartnerRecordProviders } from "../entities/business-partner-record-providers.js";
import { createPartnerRecordProviders } from "../entities/business-partner/record.js";
import { createPartnerClassificationProviders } from "../entities/business-partner/classifications.js";
import { createPartnerDecisionProviders } from "../entities/business-partner/decisions.js";
import { createPartnerCompanyProfileProviders } from "../entities/business-partner/company-profiles.js";

const ownership = {
  record: [
    "overview",
    "identity",
    "contacts",
    "addresses",
    "identifiers-tax",
    "roles-scope",
    "banking",
    "credit",
    "requests",
    "activity",
    "business-activity",
    "network",
  ].map((key) => `neon.bp.section.${key}.v1`),
  classifications: ["industries", "commodities"].map(
    (key) => `neon.bp.section.${key}.v1`,
  ),
  decisions: [
    "neon.bp.section.certificates.v1",
    "neon.bp.section.qualifications-certificates.v1",
    "neon.bp.section.qualifications.v2",
    "neon.bp.section.restrictions.v1",
  ],
  companyProfiles: ["supplier-company", "customer-company"].map(
    (key) => `neon.bp.section.${key}.v1`,
  ),
};
const context = { tenantId: "tenant", principalId: "actor", planeKey: "neon" };
const scope = {
  operatingOrganizationId: "org",
  companyCodeId: "company",
  legalEntityId: "legal",
  roleLens: "supplier",
  asOf: "2026-09-25",
};
const input = {
  context,
  recordId: "bp",
  resourceContext: scope,
  limit: 2,
  cursor: "first",
} as any;
const metadataRoot = new URL(
  "../../../../../../metadata/products/mdg/entities/business_partner/",
  import.meta.url,
);
const artifact = (key: string) =>
  JSON.parse(
    readFileSync(
      new URL(`presentation.section.${key}.json`, metadataRoot),
      "utf8",
    ),
  );

it("preserves industry facts and evidence without leaking unrelated identity rows", async () => {
  const evidence = [{ id: "crosswalk" }];
  const section = vi.fn().mockResolvedValue({
    businessPartnerVersion: 5,
    state: "ready",
    page: { nextCursor: "next" },
    data: {
      items: [
        { id: "identity", kind: "canonical" },
        {
          id: "industry",
          kind: "classification",
          industryDomainCode: "isic",
          industryCode: "1234",
          primary: true,
          verified: true,
        },
      ],
      collections: { industry_crosswalk_reference_evidence: evidence },
    },
  });
  const result = await createPartnerClassificationProviders(
    { section } as never,
    {} as never,
  )
    .get("neon.bp.section.industries.v1")!
    .read(input);
  expect(section).toHaveBeenCalledWith({
    context,
    businessPartnerId: "bp",
    sectionCode: "identity",
    limit: 2,
    cursor: "first",
    ...scope,
  });
  expect(result).toMatchObject({
    revision: "5",
    data: {
      state: "ready",
      nextCursor: "next",
      collections: {
        industries: [
          {
            id: "industry",
            industry_domain_code: "isic",
            industry_code: "1234",
            is_primary: true,
            verification_status: "verified",
          },
        ],
        industry_crosswalk_reference_evidence: evidence,
      },
    },
  });
  expect((result.data as any).collections.industries).toHaveLength(1);
});

it("preserves the nested identifier/tax response and clears its mixed item list", async () => {
  const identifier = {
      id: "identifier",
      kind: "identifier",
      maskedValue: "••••1001",
    },
    tax = { id: "tax", kind: "tax", maskedValue: "••••2001" };
  const section = vi.fn().mockResolvedValue({
    businessPartnerVersion: 6,
    state: "ready",
    page: { nextCursor: "next" },
    data: { items: [identifier, tax, { id: "unrelated", kind: "other" }] },
  });
  const result = await createPartnerRecordProviders({ section } as never)
    .sections.get("neon.bp.section.identifiers-tax.v1")!
    .read(input);
  expect(result).toEqual({
    revision: "6",
    data: {
      businessPartnerVersion: 6,
      state: "ready",
      page: { nextCursor: "next" },
      nextCursor: "next",
      data: {
        items: [],
        collections: { identifiers: [identifier], tax_registrations: [tax] },
      },
    },
  });
});

it("assigns every retained handler to exactly one domain adapter without eager reads", () => {
  const section = vi.fn(),
    read = vi.fn();
  const service = { section } as never;
  const groups = {
    record: createPartnerRecordProviders(service).sections,
    classifications: createPartnerClassificationProviders(service, {
      read,
    } as never),
    decisions: createPartnerDecisionProviders(service, { read } as never),
    companyProfiles: createPartnerCompanyProfileProviders({ read } as never),
  };
  const composed = createBusinessPartnerRecordProviders(
    service,
    { read } as never,
    { read } as never,
    { read } as never,
  );
  for (const [owner, keys] of Object.entries(ownership))
    for (const key of keys) {
      expect(
        Object.entries(groups)
          .filter(([, provider]) => provider.get(key))
          .map(([name]) => name),
      ).toEqual([owner]);
      expect(composed.sections.get(key)).toBeDefined();
    }
  for (const key of [
    "toString",
    "constructor",
    "__proto__",
    "missing",
    "neon.bp.section.workforce.v1",
  ]) {
    expect(composed.sections.get(key)).toBeUndefined();
    for (const provider of Object.values(groups))
      expect(provider.get(key)).toBeUndefined();
  }
  expect(section).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});

it("resolves current metadata's BP domain bindings while retaining the retired workforce exclusion", () => {
  const providers = createBusinessPartnerRecordProviders(
    {} as never,
    {} as never,
  );
  const bindings = readdirSync(metadataRoot)
    .filter((name) => /^presentation\.section\..*\.json$/.test(name))
    .map(
      (name) =>
        JSON.parse(readFileSync(new URL(name, metadataRoot), "utf8"))
          .dataBinding?.handlerKey,
    )
    .filter(
      (key): key is string =>
        typeof key === "string" && key.startsWith("neon.bp.section."),
    );
  expect(bindings).toContain("neon.bp.section.workforce.v1");
  for (const key of bindings)
    expect(Boolean(providers.sections.get(key))).toBe(
      key !== "neon.bp.section.workforce.v1",
    );
  expect(
    new Set(bindings.filter((key) => key !== "neon.bp.section.workforce.v1")),
  ).toEqual(
    new Set(
      Object.values(ownership)
        .flat()
        .filter(
          (key) => key !== "neon.bp.section.qualifications-certificates.v1",
        ),
    ),
  );
});

it.each(["supplier", "customer"])(
  "keeps %s company profiles on their dedicated authorized reader",
  async (capability) => {
    const output = {
      revision: "7",
      data: { state: "ready", items: [{ id: "profile" }] },
    };
    const read = vi.fn().mockResolvedValue(output),
      section = vi.fn();
    const providers = createBusinessPartnerRecordProviders(
      { section } as never,
      {} as never,
      undefined,
      { read } as never,
    );
    const key = `neon.bp.section.${capability}-company.v1`;
    expect(await providers.sections.get(key)!.read(input)).toBe(output);
    expect(read).toHaveBeenCalledWith({
      context,
      recordId: "bp",
      capability,
      ...scope,
    });
    expect(section).not.toHaveBeenCalled();
    read.mockRejectedValueOnce(
      new MasterDataError(400, "BP_360_SCOPE_REQUIRED", "internal"),
    );
    await expect(
      providers.sections.get(key)!.read(input),
    ).rejects.toMatchObject({
      status: 409,
      code: "ENTITY_RUNTIME_CONTEXT_REQUIRED",
    });
    await expect(
      createPartnerCompanyProfileProviders().get(key)!.read(input),
    ).rejects.toMatchObject({
      status: 503,
      code: "PARTNER_COMPANY_PROFILES_UNAVAILABLE",
    });
  },
);

it.each(["qualifications-certificates", "restrictions"])(
  "preserves %s decision admission and service arguments",
  async (key) => {
    const content = artifact(key),
      read = vi
        .fn()
        .mockRejectedValue(new MasterDataError(403, "PRIVATE", "internal"));
    const handlerKey = content.dataBinding.handlerKey;
    await expect(
      createPartnerDecisionProviders({} as never, { read } as never)
        .get(handlerKey)!
        .read({ ...input, section: { content } }),
    ).rejects.toMatchObject({
      status: 403,
      code: "ENTITY_RUNTIME_RECORD_UNAVAILABLE",
    });
    expect(read).toHaveBeenCalledWith({
      context,
      recordId: "bp",
      kind: key === "restrictions" ? "restrictions" : "qualifications",
      limit: 2,
      cursor: "first",
    });
    await expect(
      createPartnerDecisionProviders({} as never)
        .get(handlerKey)!
        .read({ ...input, section: { content } }),
    ).rejects.toMatchObject({
      status: 503,
      code: "PARTNER_DECISION_VIEWS_UNAVAILABLE",
    });
  },
);

it("keeps commodity projection, crosswalk deduplication and paging intact", async () => {
  const crosswalk = { id: "evidence" };
  const read = vi.fn().mockResolvedValue({
    items: [
      {
        id: "assignment",
        recordVersion: 3,
        classificationBasis: "direct_unspsc",
        categoryMappings: [],
        commodityCodes: [{ crosswalks: [crosswalk, crosswalk] }],
      },
    ],
    nextCursor: "next",
  });
  const result = await createPartnerClassificationProviders(
    {} as never,
    { read } as never,
  )
    .get("neon.bp.section.commodities.v1")!
    .read(input);
  expect(read).toHaveBeenCalledWith({
    context,
    businessPartnerId: "bp",
    limit: 2,
    cursor: "first",
    ...scope,
  });
  expect(result).toMatchObject({
    revision: "assignment:3",
    data: {
      state: "ready",
      nextCursor: "next",
      collections: {
        commodity_classifications: [
          {
            id: "assignment",
            business_partner_id: "bp",
            verification_status: "unverified",
            category_matches: "Not mapped (optional)",
            record_version: 3,
          },
        ],
        commodity_crosswalk_reference_evidence: [crosswalk],
      },
    },
  });
  read.mockRejectedValueOnce(new MasterDataError(404, "PRIVATE", "internal"));
  await expect(
    createPartnerClassificationProviders({} as never, { read } as never)
      .get("neon.bp.section.commodities.v1")!
      .read(input),
  ).rejects.toMatchObject({
    status: 404,
    code: "ENTITY_RUNTIME_RECORD_UNAVAILABLE",
  });
});

it("shares one authorized summary read per request and rejects other entity summaries", async () => {
  const summary = vi.fn().mockResolvedValue({
    primaryContact: null,
    primaryAddress: { id: "address" },
    roles: [{ code: "supplier" }],
    openWork: { count: 1 },
    sections: [{ code: "banking", count: 2 }],
    completeness: { status: "complete", percent: 100 },
  });
  const providers = createPartnerRecordProviders({ summary } as never);
  const request = {
    ...input,
    core: { entityCode: "business_partner" },
    requestCache: new Map(),
  };
  const result = await Promise.all(
    [
      "primary-contact",
      "primary-address",
      "relationship-summary",
      "governance-state",
    ].map((key) => providers.summaries!.get(key)!.read(request)),
  );
  expect(summary).toHaveBeenCalledTimes(1);
  expect(summary).toHaveBeenCalledWith({
    context,
    businessPartnerId: "bp",
    ...scope,
  });
  expect(result[0]).toEqual({ state: "empty", value: null });
  expect(result[2]).toEqual({
    state: "ready",
    value: {
      roles: ["supplier"],
      openWork: { count: 1 },
      sectionCounts: { banking: 2 },
    },
  });
  expect(result[3]).toEqual({
    state: "ready",
    value: { completeness: "complete", percent: 100, openWork: { count: 1 } },
  });
  expect(providers.summaries!.get("constructor")).toBeUndefined();
  await expect(
    providers
      .summaries!.get("primary-contact")!
      .read({ ...request, core: { entityCode: "contact_person" } }),
  ).rejects.toMatchObject({ status: 503 });
  expect(summary).toHaveBeenCalledTimes(1);
});
