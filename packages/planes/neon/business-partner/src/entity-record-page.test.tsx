// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  entityRuntimeClient,
  type EntityRuntimeBootstrapResource,
  type EntityRuntimeSectionResource,
} from "@athyper/platform-entity-descriptor-client";
import { EntityRecordPage } from "../../../../platform/entity/runtime/form-detail/src/record/entity-record-page";
import { createRecordRevealRequest } from "../../../../platform/entity/runtime/form-detail/src/record/protected-operation-registry";
import {
  readSection,
  readResourceContext,
} from "../../../../platform/entity/runtime/form-detail/src/record/record-url-state";
import {
  readRecordViewPreference,
  writeRecordViewPreference,
} from "../../../../platform/entity/runtime/form-detail/src/record/record-view-preferences";
import type {
  EntityRecordAdapter,
  EntityRecordOperationContext,
} from "../../../../platform/entity/runtime/form-detail/src/record/record-contracts";

const foundation = vi.hoisted(() => ({
  http: {},
  identity: {
    scope: { tenantId: "tenant", principalId: "actor", authEpoch: 1 },
  },
}));
vi.mock(
  "@athyper/platform-entity-descriptor-client",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@athyper/platform-entity-descriptor-client")
      >();
    return {
      ...actual,
      entityRuntimeClient: { ...actual.entityRuntimeClient },
    };
  },
);
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => foundation.http,
  useSessionIdentity: () => foundation.identity,
  readBrowserCsrfToken: () => "test",
}));
vi.mock("@athyper/platform-shell", () => ({
  useRecordPage: () => {},
  useRecordBreadcrumb: () => {},
  useAtlasBusinessContextPublisher: () => {},
  PageWorkspace: ({ children }: any) => <main>{children}</main>,
  PageHeader: ({ title, description, actions }: any) => (
    <header>
      <h1>{title}</h1>
      {description}
      {actions}
    </header>
  ),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

for (const [entityCode, label, field, value] of [
  ["business_partner", "Business Partner", "name", "Aster Demo"],
  ["contact_person", "Contact", "contact_name", "Alex Example"],
]) {
  it(`renders ${entityCode} through the same page/runtime and published field shape`, async () => {
    const core = JSON.parse(
      readFileSync(
        new URL(
          `../../../../../metadata/products/mdg/entities/${entityCode}/core.json`,
          import.meta.url,
        ).pathname.replace(/^\/@fs/, ""),
        "utf8",
      ),
    );
    const definition = core.fields.find((f: any) => f.key === field);
    expect(definition).toBeDefined();
    const adapter: EntityRecordAdapter = {
      entityCode,
      label,
      recordHref: (id) => `/records/${entityCode}/${id}`,
    };
    const bootstrap: EntityRuntimeBootstrapResource = {
      releaseId: "release",
      releaseHash: "hash",
      header: {
        revision: "1",
        values: {
          name: value,
          code: "DEMO",
          status: "active",
          displayLabels: { status: "Active" },
        },
      },
      plan: {
        entityCode,
        releaseId: "release",
        releaseHash: "hash",
        surfaceKey: "detail",
        headerFieldKeys: ["name"],
        sections: [
          {
            key: "overview",
            presentationRef: "overview",
            label: { labelKey: "overview", defaultText: "Overview" },
            loadPolicy: "initial",
          },
          {
            key: "details",
            presentationRef: "details",
            label: { labelKey: "details", defaultText: "Details" },
            loadPolicy: "active",
          },
        ],
        initialSectionKeys: ["overview"],
        actions: [],
      },
    };
    const read = vi
      .spyOn(entityRuntimeClient, "bootstrap")
      .mockResolvedValue(bootstrap);
    const section = vi
      .spyOn(entityRuntimeClient, "section")
      .mockImplementation(
        async (_http, input) =>
          ({
            releaseId: "release",
            releaseHash: "hash",
            sectionKey: input.sectionKey,
            revision: "1",
            presentation: {
              rendererKey: "platform.fields.v1",
              childCollections: [],
              fields: [{ key: field, label: definition.label }],
            },
            data: {
              state: "ready",
              values: {
                [field]:
                  input.sectionKey === "details" ? "Second section" : value,
              },
            },
          }) as EntityRuntimeSectionResource,
      );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <EntityRecordPage
            adapter={adapter}
            recordId={`${entityCode}-record`}
          />,
        ),
      );
      expect(host.querySelector("h1")?.textContent).toBe(value);
      expect(read.mock.calls[0]?.[1].entityCode).toBe(entityCode);
      expect(host.textContent).toContain(definition.label.defaultText);
      const details = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent === "Details",
      )!;
      await act(async () => details.click());
      expect(window.location.search).toContain("section=details");
      expect(host.textContent).toContain("Second section");
      expect(
        section.mock.calls.every(
          ([, input]) => input.entityCode === entityCode,
        ),
      ).toBe(true);
      if (entityCode !== "business_partner")
        expect(host.textContent).not.toContain("Business Partner");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
}
it("denies unknown/inherited and historical reveal operations before invoking adapters", async () => {
  const handler = vi.fn(async () => ({
    value: "synthetic",
    expiresAt: "later",
  }));
  const context = {
    http: foundation.http,
    entityCode: "contact_person",
    recordId: "contact",
  } as EntityRecordOperationContext;
  const request = createRecordRevealRequest(context, {
    "contact.reveal": handler,
  });
  for (const key of ["missing", "toString", "constructor"])
    await expect(
      request(key, "id", "review", new AbortController().signal),
    ).rejects.toThrow("Unregistered");
  await expect(
    createRecordRevealRequest(
      { ...context, resourceContext: { asOf: "2025-01-01" } },
      { "contact.reveal": handler },
    )("contact.reveal", "id", "review", new AbortController().signal),
  ).rejects.toThrow("Historical");
  expect(handler).not.toHaveBeenCalled();
  await request("contact.reveal", "id", "review", new AbortController().signal);
  expect(handler).toHaveBeenCalledOnce();
});
it("keeps explicit section navigation and preferences isolated by entity", () => {
  window.history.replaceState(
    {},
    "",
    "/?tab=360&section=banking&asOf=2025-01-01",
  );
  expect(readSection(() => "overview")).toBe("banking");
  expect(readResourceContext()?.asOf).toBe("2025-01-01");
  writeRecordViewPreference("partner", { summary: true, section: true });
  expect(readRecordViewPreference("contact")).toEqual({
    summary: false,
    section: false,
  });
  expect(readRecordViewPreference("partner")).toEqual({
    summary: true,
    section: true,
  });
});
