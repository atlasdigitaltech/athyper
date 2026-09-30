import { describe, expect, it, vi } from "vitest";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import { createEntityRuntimeResourceService } from "./entity-section-service.js";

const core = artifact("core", "business_partner/core", {
  fields: [{ key: "name" }, { key: "code" }, { key: "status" }],
});
const surface = artifact(
  "presentation_surface",
  "business_partner/presentation.detail",
  {
    surfaceKey: "detail",
    header: { titleField: "name", codeField: "code", statusField: "status" },
    sections: [
      {
        sectionKey: "overview",
        presentationRef: "business_partner/presentation.section.overview.json",
        viewPermission: "bp.read",
      },
      {
        sectionKey: "contacts",
        presentationRef: "business_partner/presentation.section.contacts.json",
        viewPermission: "bp.contacts.read",
      },
    ],
    actions: [],
  },
);
const operation = artifact("operation", "business_partner/operation", {
  operations: [],
});
const overview = artifact(
  "presentation_section",
  "business_partner/presentation.section.overview",
  {
    sectionKey: "overview",
    rendererKey: "platform.fields.v1",
    fieldBindings: [{ fieldKey: "name" }],
    dataBinding: {
      kind: "registered_service",
      handlerKey: "neon.bp.section.overview.v1",
    },
  },
);
const context = {
  tenantId: "tenant",
  principalId: "principal",
  planeKey: "neon",
  permissions: { allowed: ["bp.read"] },
} as any;

describe("entity runtime resource service", () => {
  it("routes normalized Summary to the pinned provider service without requiring a legacy surface", async () => {
    const release = {
      artifactIndex: new Map([["business_partner/runtime", {}]]),
      release: {
        releaseId: "release-1",
        releaseHash: `sha256:${"a".repeat(64)}`,
      },
    };
    const reader = {
      resolve: vi.fn(async () => release),
      surfaceModel: vi.fn(),
    };
    const publishedSummary = vi.fn(async () => ({ cards: [] }));
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      publishedSummary,
      headers: { readHeader: vi.fn() },
      sections: { get: vi.fn() },
    });
    const input = {
      context,
      entityCode: "business_partner",
      recordId: "record",
      surfaceKey: "detail",
    };
    await service.summary(input);
    expect(publishedSummary).toHaveBeenCalledWith(input, release);
    expect(reader.surfaceModel).not.toHaveBeenCalled();
    expect(
      await service.summary({ ...input, surfaceKey: "undeclared" }),
    ).toBeNull();
    expect(publishedSummary).toHaveBeenCalledOnce();
  });
  it("projects header tone from the pinned entity surface", async () => {
    const publishedSurface = artifact(
      "presentation_surface",
      surface.artifactKey,
      {
        ...surface.content,
        header: {
          titleField: "name",
          statusField: "status",
          statusTones: { published: "success" },
        },
      },
    );
    const reader = {
      surfaceModel: async () => ({
        release: {
          release: {
            releaseId: "release",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface: publishedSurface,
      }),
      operation: async () => operation,
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: {
        readHeader: async () => ({
          revision: "1",
          values: {
            name: "Example",
            status: "Published",
            statusTone: "danger",
          },
        }),
      },
      sections: { get: vi.fn() },
    });
    const result = await service.bootstrap({
      context,
      entityCode: "business_partner",
      recordId: "record",
      surfaceKey: "detail",
    });
    expect(result?.header.values.statusTone).toBe("success");
  });
  it("evaluates child visibility using each row, including an empty field projection", async () => {
    const fields = ["organization", "person"].map((category) => ({
      key: category,
      dynamicFacets: [
        {
          facet: "visibility",
          engine: "jsonlogic.v1",
          expression: { "==": [{ var: "record.category" }, category] },
          valueWhenTrue: "visible",
          valueWhenFalse: "hidden",
        },
      ],
    }));
    const child = artifact("core", "child/core", { fields });
    const section = artifact("presentation_section", overview.artifactKey, {
      ...overview.content,
      childCollections: [
        {
          key: "rows",
          coreRef: "child/core.json",
          rendererKey: "platform.related-collection.v1",
          fieldBindings: fields.map((f) => ({ fieldKey: f.key })),
        },
      ],
    });
    const reader = {
      surfaceModel: async () => ({
        release: {
          release: {
            releaseId: "release",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface,
      }),
      operation: async () => operation,
      section: async () => section,
      artifactByKey: async () => child,
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: { readHeader: vi.fn() },
      sections: {
        get: () => ({
          read: async () => ({
            revision: "1",
            data: {
              values: { category: "organization" },
              collections: {
                rows: [
                  { category: "person" },
                  { category: "organization" },
                  {},
                ],
              },
            },
          }),
        }),
      },
    });
    const result = await service.section({
      context,
      entityCode: "business_partner",
      recordId: "partner",
      surfaceKey: "detail",
      sectionKey: "overview",
    });
    expect(
      result?.presentation.childCollections[0]?.rowFields?.map((fields) =>
        fields.map((f) => f.key),
      ),
    ).toEqual([["person"], ["organization"], []]);
  });
  it("projects an explicit attachment download binding only for UUID fields", async () => {
    const typed = artifact("core", core.artifactKey, {
      fields: [
        {
          key: "document",
          dataType: "uuid",
          display: { attachmentDownload: true },
        },
        { key: "plain", dataType: "uuid" },
        {
          key: "invalid",
          dataType: "string",
          display: { attachmentDownload: true },
        },
      ],
    });
    const section = artifact("presentation_section", overview.artifactKey, {
      ...overview.content,
      fieldBindings: ["document", "plain", "invalid"].map((fieldKey) => ({
        fieldKey,
      })),
    });
    const reader = {
      surfaceModel: async () => ({
        release: {
          release: {
            releaseId: "release",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core: typed,
        surface,
      }),
      operation: async () => operation,
      section: async () => section,
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: { readHeader: vi.fn() },
      sections: {
        get: () => ({ read: async () => ({ revision: "1", data: {} }) }),
      },
    });
    const result = await service.section({
      context,
      entityCode: "business_partner",
      recordId: "partner",
      surfaceKey: "detail",
      sectionKey: "overview",
    });
    expect(result?.presentation.fields).toEqual([
      { key: "document", attachmentDownload: true },
      { key: "plain" },
      { key: "invalid" },
    ]);
  });
  it("normalizes root protection onto its masked field with an explicit reveal target", async () => {
    const purposes = [
      {
        value: "partner_review",
        label: { labelKey: "review", defaultText: "Partner review" },
      },
    ];
    const typed = artifact("core", core.artifactKey, {
      entityCode: "business_partner_banking",
      fields: [{ key: "account_last4" }],
      protections: [
        {
          protectedSource: { maskedByFieldKey: "account_last4" },
          normalProjection: { displayPrefix: "••••" },
          reveal: {
            operationKey: "reveal",
            targetField: "reveal_link_id",
            purposes,
          },
        },
      ],
    });
    const section = artifact("presentation_section", overview.artifactKey, {
      ...overview.content,
      fieldBindings: [{ fieldKey: "account_last4" }],
    });
    const reader = {
      surfaceModel: async () => ({
        release: {
          release: {
            releaseId: "release",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core: typed,
        surface,
      }),
      operation: async () => operation,
      section: async () => section,
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: { readHeader: vi.fn() },
      sections: {
        get: () => ({ read: async () => ({ revision: "1", data: {} }) }),
      },
    });
    const result = await service.section({
      context,
      entityCode: "business_partner",
      recordId: "partner",
      surfaceKey: "detail",
      sectionKey: "overview",
    });
    expect(result?.presentation.fields).toEqual([
      {
        key: "account_last4",
        maskedPrefix: "••••",
        revealOperation: "business_partner_banking.reveal",
        revealTargetField: "reveal_link_id",
        revealPurposes: purposes,
      },
    ]);
  });
  it.each([
    ["person", ["person_name"]],
    ["organization", ["legal_name"]],
    [undefined, []],
  ])(
    "filters category facets from authorized values: %s",
    async (category, expected) => {
      const fields = ["legal_name", "person_name"].map((key, i) => ({
        key,
        dynamicFacets: [
          {
            facet: "visibility",
            engine: "jsonlogic.v1",
            expression: {
              "==": [
                { var: "record.partner_category" },
                i ? "person" : "organization",
              ],
            },
            valueWhenTrue: "visible",
            valueWhenFalse: "hidden",
          },
        ],
      }));
      const typed = artifact("core", core.artifactKey, { fields });
      const section = artifact("presentation_section", overview.artifactKey, {
        ...overview.content,
        fieldBindings: fields.map((f) => ({ fieldKey: f.key })),
      });
      const reader = {
        surfaceModel: async () => ({
          release: {
            release: {
              releaseId: "release",
              releaseHash: `sha256:${"a".repeat(64)}`,
            },
          },
          core: typed,
          surface,
        }),
        operation: async () => operation,
        section: async () => section,
      };
      const service = createEntityRuntimeResourceService({
        reader: reader as any,
        headers: { readHeader: vi.fn() },
        sections: {
          get: () => ({
            read: async () => ({
              revision: "1",
              data: { values: category ? { partner_category: category } : {} },
            }),
          }),
        },
      });
      const result = await service.section({
        context,
        entityCode: "business_partner",
        recordId: "partner",
        surfaceKey: "detail",
        sectionKey: "overview",
      });
      expect(result?.presentation.fields.map((f) => f.key)).toEqual(expected);
    },
  );
  it("projects enum labels from core metadata without rewriting stored codes", async () => {
    const options = [
      {
        value: "external",
        label: { labelKey: "test.external", defaultText: "External party" },
      },
    ];
    const typed = artifact("core", core.artifactKey, {
      fields: [
        {
          key: "ownership_class",
          dataType: "enum",
          display: { lookup: { options } },
        },
      ],
    });
    const section = artifact("presentation_section", overview.artifactKey, {
      ...overview.content,
      fieldBindings: [{ fieldKey: "ownership_class" }],
    });
    const reader = {
      surfaceModel: async () => ({
        release: {
          release: {
            releaseId: "release",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core: typed,
        surface,
      }),
      operation: async () => operation,
      section: async () => section,
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: { readHeader: vi.fn() },
      sections: {
        get: () => ({
          read: async () => ({
            revision: "1",
            data: { values: { ownership_class: "external" } },
          }),
        }),
      },
    });
    const result = await service.section({
      context,
      entityCode: "business_partner",
      recordId: "partner",
      surfaceKey: "detail",
      sectionKey: "overview",
    });
    expect(result?.presentation.fields).toEqual([
      { key: "ownership_class", options },
    ]);
    expect(result?.data).toEqual({ values: { ownership_class: "external" } });
  });
  it("resolves child choices from their pinned owning Core and declared catalog", async () => {
    const child = artifact("core", "child/core", {
      fields: [
        {
          key: "status",
          dataType: "enum",
          display: {
            lookup: {
              options: [
                {
                  value: "active",
                  label: {
                    labelKey: "child.active",
                    defaultText: "Child active",
                  },
                },
              ],
            },
          },
        },
        {
          key: "scheme",
          display: { lookup: { code: "shared.classification_scheme" } },
        },
      ],
    });
    const section = artifact("presentation_section", overview.artifactKey, {
      ...overview.content,
      childCollections: [
        {
          key: "rows",
          coreRef: "child/core.json",
          rendererKey: "platform.related-collection.v1",
          fieldBindings: [{ fieldKey: "status" }, { fieldKey: "scheme" }],
        },
      ],
    });
    const reader = {
      surfaceModel: async () => ({
        release: {
          release: {
            releaseId: "release",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface,
      }),
      operation: async () => operation,
      section: async () => section,
      artifactByKey: vi.fn(async () => child),
    };
    const catalog = vi.fn(async () => [
      {
        value: "isic",
        label: { labelKey: "scheme.isic", defaultText: "Catalog scheme name" },
      },
    ]);
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      displayChoices: catalog,
      headers: { readHeader: vi.fn() },
      sections: {
        get: () => ({
          read: async () => ({
            revision: "1",
            data: {
              collections: { rows: [{ status: "active", scheme: "isic" }] },
            },
          }),
        }),
      },
    });
    const result = await service.section({
      context,
      entityCode: "business_partner",
      recordId: "partner",
      surfaceKey: "detail",
      sectionKey: "overview",
    });
    expect(reader.artifactByKey).toHaveBeenCalledWith(
      expect.anything(),
      "child/core",
      "core",
    );
    expect(catalog).toHaveBeenCalledWith(
      context,
      "shared.classification_scheme",
      undefined,
    );
    expect(
      result?.presentation.childCollections[0]?.fields.map(
        (f) => f.options?.[0]?.label.defaultText,
      ),
    ).toEqual(["Child active", "Catalog scheme name"]);
  });
  it("projects explicit collection captions and collapsed reference presentation without leaking internal metadata", async () => {
    const mapping = {
      key: "related_mappings",
      rendererKey: "platform.related-collection.v1",
      display: "disclosure",
      label: {
        labelKey: "classification.related_mappings",
        defaultText: "Related classification mappings",
      },
      description: "Not partner declarations.",
      fieldBindings: [
        {
          fieldKey: "verified",
          label: {
            labelKey: "mapping.verified",
            defaultText: "Mapping verified",
          },
        },
      ],
      handlerSecret: "hidden",
    };
    const section = artifact("presentation_section", overview.artifactKey, {
      ...overview.content,
      childCollections: [mapping],
    });
    const reader = {
      surfaceModel: async () => ({
        release: {
          release: {
            releaseId: "release",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface,
      }),
      operation: async () => operation,
      section: async () => section,
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: { readHeader: vi.fn() },
      sections: {
        get: () => ({ read: async () => ({ revision: "1", data: {} }) }),
      },
    });
    const result = await service.section({
      context,
      entityCode: "business_partner",
      recordId: "partner",
      surfaceKey: "detail",
      sectionKey: "overview",
    });
    expect(result?.presentation.childCollections[0]).toEqual({
      key: "related_mappings",
      rendererKey: "platform.related-collection.v1",
      display: "disclosure",
      label: mapping.label,
      description: mapping.description,
      fields: [{ key: "verified", label: mapping.fieldBindings[0]!.label }],
    });
  });
  it("uses one header projection and refuses denied sections before handler invocation", async () => {
    const readHeader = vi.fn(async () => ({
      revision: "record-1",
      values: { name: "Acme" },
    }));
    const handler = {
      read: vi.fn(async () => ({ revision: "section-1", data: { items: [] } })),
    };
    const reader = {
      surfaceModel: vi.fn(async () => ({
        release: {
          release: {
            releaseId: "release-1",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface,
      })),
      operation: vi.fn(async () => operation),
      section: vi.fn(async () => overview),
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: { readHeader },
      sections: {
        get: vi.fn((key) =>
          key === "neon.bp.section.overview.v1" ? handler : undefined,
        ),
      },
    });
    const bootstrap = await service.bootstrap({
      context,
      entityCode: "business_partner",
      recordId: "00000000-0000-4000-8000-000000000001",
      surfaceKey: "detail",
    });
    expect(readHeader).toHaveBeenCalledWith(
      expect.objectContaining({ fieldKeys: ["name", "code", "status"] }),
    );
    expect(bootstrap?.plan.sections.map((section) => section.key)).toEqual([
      "overview",
    ]);
    await expect(
      service.section({
        context,
        entityCode: "business_partner",
        recordId: "00000000-0000-4000-8000-000000000001",
        surfaceKey: "detail",
        sectionKey: "contacts",
      }),
    ).resolves.toBeNull();
    expect(reader.section).not.toHaveBeenCalled();
    await expect(
      service.section({
        context,
        entityCode: "business_partner",
        recordId: "00000000-0000-4000-8000-000000000001",
        surfaceKey: "detail",
        sectionKey: "overview",
      }),
    ).resolves.toMatchObject({
      sectionKey: "overview",
      presentation: {
        rendererKey: "platform.fields.v1",
        fields: [{ key: "name" }],
      },
    });
    expect(handler.read).toHaveBeenCalledOnce();
    expect(handler.read).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25 }),
    );
  });
  it("resolves header catalog labels while retaining the stored code", async () => {
    const typedCore = artifact("core", core.artifactKey, {
      fields: [
        {
          key: "status",
          dataType: "enum",
          display: { lookup: { code: "shared.status" } },
        },
      ],
    });
    const reader = {
      surfaceModel: vi.fn(async () => ({
        release: {
          release: {
            releaseId: "release-1",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core: typedCore,
        surface,
      })),
      operation: vi.fn(async () => operation),
    };
    const displayChoices = vi.fn(async () => [
      { value: "active", label: { labelKey: "active", defaultText: "Active" } },
    ]);
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: {
        readHeader: vi.fn(async () => ({
          revision: "1",
          values: { status: "active" },
        })),
      },
      sections: { get: vi.fn() },
      displayChoices,
    });
    const result = await service.bootstrap({
      context,
      entityCode: "business_partner",
      recordId: "record",
      surfaceKey: "detail",
    });
    expect(result?.header.values).toMatchObject({
      status: "active",
      displayLabels: { status: "Active" },
    });
    expect(displayChoices).toHaveBeenCalledWith(context, "shared.status", [
      "active",
    ]);
  });

  it("reads declared summary cards lazily and isolates an unavailable provider", async () => {
    const summarySurface = artifact(
      "presentation_surface",
      "business_partner/presentation.detail",
      {
        ...surface.content,
        summaryView: {
          cards: [
            {
              key: "primary-contact",
              provider: "primary-contact",
              rendererKey: "platform.contact.summary.v1",
              label: {
                labelKey: "summary.contact",
                defaultText: "Primary Contact",
              },
            },
            {
              key: "governance",
              provider: "governance-state",
              rendererKey: "platform.summary.status.v1",
              label: {
                labelKey: "summary.governance",
                defaultText: "Governance",
              },
            },
          ],
        },
      },
    );
    const handler = { read: vi.fn(async () => ({ name: "Nurul Aziz" })) };
    const reader = {
      surfaceModel: vi.fn(async () => ({
        release: {
          release: {
            releaseId: "release-1",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface: summarySurface,
      })),
      operation: vi.fn(async () => operation),
      section: vi.fn(),
    };
    Object.assign(reader, {
      resolve: async () => ({
        artifactIndex: new Map([
          ["business_partner/runtime", {}],
          ["business_partner/presentation.detail", {}],
        ]),
        release: {
          releaseId: "release-1",
          releaseHash: `sha256:${"a".repeat(64)}`,
        },
      }),
    });
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: {
        readHeader: vi.fn(async () => ({ revision: "record-1", values: {} })),
      },
      sections: { get: vi.fn() },
      summaries: {
        get: vi.fn((provider) =>
          provider === "primary-contact" ? handler : undefined,
        ),
      },
    });
    await expect(
      service.summary({
        context,
        entityCode: "business_partner",
        recordId: "00000000-0000-4000-8000-000000000001",
        surfaceKey: "detail",
      }),
    ).resolves.toMatchObject({
      revision: "record-1",
      cards: [
        {
          key: "primary-contact",
          state: "ready",
          data: { name: "Nurul Aziz" },
        },
        { key: "governance", state: "unavailable" },
      ],
    });
    expect(handler.read).toHaveBeenCalledOnce();
  });

  it("resolves a published platform service key without an entity-specific handler key", async () => {
    const comments = artifact(
      "presentation_section",
      "business_partner/presentation.section.comments",
      {
        sectionKey: "comments",
        rendererKey: "platform.comments.v1",
        dataBinding: { serviceKey: "platform.comments.v1" },
      },
    );
    const permittedSurface = artifact(
      "presentation_surface",
      "business_partner/presentation.detail",
      {
        surfaceKey: "detail",
        header: {
          titleField: "name",
          codeField: "code",
          statusField: "status",
        },
        sections: [
          {
            sectionKey: "comments",
            presentationRef:
              "business_partner/presentation.section.comments.json",
            viewPermission: "bp.read",
          },
        ],
        actions: [],
      },
    );
    const handler = {
      read: vi.fn(async () => ({
        revision: "comments-1",
        data: { items: [] },
      })),
    };
    const reader = {
      surfaceModel: vi.fn(async () => ({
        release: {
          release: {
            releaseId: "release-1",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface: permittedSurface,
      })),
      operation: vi.fn(async () => operation),
      section: vi.fn(async () => comments),
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: {
        readHeader: vi.fn(async () => ({ revision: "record-1", values: {} })),
      },
      capabilities: {
        resolve: vi.fn(async () => ({
          projection: { layouts: ["drawer", "content"], actions: [] },
        })),
      } as any,
      sections: {
        get: vi.fn(),
        getService: vi.fn((key) =>
          key === "platform.comments.v1" ? handler : undefined,
        ),
      },
    });
    await expect(
      service.section({
        context,
        entityCode: "business_partner",
        recordId: "00000000-0000-4000-8000-000000000001",
        surfaceKey: "detail",
        sectionKey: "comments",
      }),
    ).resolves.toMatchObject({
      sectionKey: "comments",
      revision: "comments-1",
    });
    expect(handler.read).toHaveBeenCalledOnce();
  });

  it("passes only bounded cursor pagination to an admitted section handler", async () => {
    const handler = {
      read: vi.fn(async () => ({ revision: "section-1", data: { items: [] } })),
    };
    const reader = {
      surfaceModel: vi.fn(async () => ({
        release: {
          release: {
            releaseId: "release-1",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface,
      })),
      operation: vi.fn(async () => operation),
      section: vi.fn(async () => overview),
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: { readHeader: vi.fn() },
      sections: { get: vi.fn(() => handler) },
    });
    await service.section({
      context,
      entityCode: "business_partner",
      recordId: "00000000-0000-4000-8000-000000000001",
      surfaceKey: "detail",
      sectionKey: "overview",
      limit: 1000,
      cursor: "00000000-0000-4000-8000-000000000002",
    });
    expect(handler.read).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        cursor: "00000000-0000-4000-8000-000000000002",
      }),
    );
  });
});

function artifact(
  type: CompiledEntityArtifactV2["artifactType"],
  key: string,
  content: Record<string, unknown>,
): CompiledEntityArtifactV2 {
  return {
    schema: "athyper.compiled-entity-artifact/2.0-draft",
    schemaVersion: 2,
    contractStatus: "draft_for_review",
    artifactType: type,
    artifactKey: key,
    entityCode: "business_partner",
    plane: "neon",
    dependencies: [],
    artifactHash: `sha256:${"a".repeat(64)}`,
    content,
  };
}

describe("section context handling", () => {
  it("forwards an explicit resource context only to the admitted section handler", async () => {
    const handler = {
      read: vi.fn(async () => ({ revision: "section-1", data: { items: [] } })),
    };
    const reader = {
      surfaceModel: vi.fn(async () => ({
        release: {
          release: {
            releaseId: "release-1",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface,
      })),
      operation: vi.fn(async () => operation),
      section: vi.fn(async () => overview),
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: { readHeader: vi.fn() },
      sections: { get: vi.fn(() => handler) },
    });
    await service.section({
      context,
      entityCode: "business_partner",
      recordId: "00000000-0000-4000-8000-000000000001",
      surfaceKey: "detail",
      sectionKey: "overview",
      resourceContext: {
        operatingOrganizationId: "00000000-0000-4000-8000-000000000002",
        companyCodeId: "00000000-0000-4000-8000-000000000003",
        roleLens: "supplier",
        threadRootId: "00000000-0000-4000-8000-000000000004",
      },
    });
    expect(handler.read).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceContext: {
          operatingOrganizationId: "00000000-0000-4000-8000-000000000002",
          companyCodeId: "00000000-0000-4000-8000-000000000003",
          roleLens: "supplier",
          threadRootId: "00000000-0000-4000-8000-000000000004",
        },
      }),
    );
  });

  it("turns a registered reader's expected context conflict into a safe runtime response", async () => {
    const handler = {
      read: vi.fn(async () => {
        throw Object.assign(new Error("Select context"), {
          status: 409,
          code: "BP_360_SCOPE_REQUIRED",
        });
      }),
    };
    const reader = {
      surfaceModel: vi.fn(async () => ({
        release: {
          release: {
            releaseId: "release-1",
            releaseHash: `sha256:${"a".repeat(64)}`,
          },
        },
        core,
        surface,
      })),
      operation: vi.fn(async () => operation),
      section: vi.fn(async () => overview),
    };
    const service = createEntityRuntimeResourceService({
      reader: reader as any,
      headers: { readHeader: vi.fn() },
      sections: { get: vi.fn(() => handler) },
    });
    await expect(
      service.section({
        context,
        entityCode: "business_partner",
        recordId: "00000000-0000-4000-8000-000000000001",
        surfaceKey: "detail",
        sectionKey: "overview",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "ENTITY_RUNTIME_CONTEXT_REQUIRED",
      message:
        "Select an authorized organization and company context for this section.",
    });
  });
});
