// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: {
    requestForm: vi.fn(),
    patch: vi.fn(),
    create: vi.fn(),
    validate: vi.fn(),
    submit: vi.fn(),
  },
  http: { request: vi.fn() },
  navigate: vi.fn(),
  push: vi.fn(),
  intake: {
    setBusy: vi.fn(),
    markSaved: vi.fn(),
    setPresentation: vi.fn(),
    state: { completed: [] },
  },
}));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  createBusinessPartnerClient: () => mocks.api,
}));
vi.mock("@athyper/platform-shell-app-foundation", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useApiClient: () => mocks.http,
  useSessionIdentity: () => ({}),
  useToasts: () => ({ push: mocks.push }),
}));
vi.mock("@athyper/product-neon-shell", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useNeonWorkContext: () => ({ selection: { mode: "all" } }),
}));
vi.mock("@athyper/platform-shell", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useRecordBreadcrumb: () => undefined,
}));
vi.mock("@athyper/platform-surface-kit", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  PageSurface: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("./case-experience", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useGuardedNavigation: () => ({ navigate: mocks.navigate }),
  UnsavedChangesDialog: () => null,
}));
vi.mock("./request-attachment-field", () => ({
  RequestAttachmentScope: ({ children }: any) => <>{children}</>,
  RequestAttachmentField: () => null,
}));
vi.mock("@athyper/platform-entity-form-detail", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useEntityIntake: () => mocks.intake,
  EntityIntakeForm: ({ children, onSubmit }: any) => (
    <form onSubmit={onSubmit}>{children}</form>
  ),
  EntityDataSurface: () => null,
  EntityIntakeBackButton: () => null,
  EntityDraftSaveButton: ({ children, onSave, disabled }: any) => (
    <button type="button" disabled={disabled} onClick={onSave}>
      {children}
    </button>
  ),
}));
import { ApiTransportError } from "@athyper/platform-api-client";
import { NewBusinessPartnerRequest } from "./index";

it.each([
  [true, 0],
  [true, 503],
  [false, 0],
  [false, 503],
])(
  "uncertain save retries the same command and original submit intent (%s, %s)",
  async (submitRequest, status) => {
    vi.clearAllMocks();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const definition = { hash: "hash", version: "1", releaseId: "release" };
    const request = {
      id: "case-1",
      requestNo: "BP-1",
      operatingOrganizationId: "org",
      rowVersion: 1,
      proposedPayload: {},
      createdAt: "2026-09-14T00:00:00Z",
    };
    const surface = {
      schemaVersion: 1,
      key: "intake_details",
      title: "Details",
      columns: 1,
      sections: [],
      formLabels: {
        continue: "Continue",
        saveDraft: "Save draft",
        savingDraft: "Saving",
        draftRetry: "Retry saving",
      },
    };
    mocks.api.requestForm.mockResolvedValue({ definition });
    mocks.http.request.mockResolvedValue({ intakeSurfaces: [surface] });
    mocks.api.patch
      .mockRejectedValueOnce(
        new ApiTransportError(
          status ? "dependency" : "timeout",
          "Save outcome unknown",
          Number(status),
        ),
      )
      .mockResolvedValueOnce({ request: { ...request, rowVersion: 2 } });
    mocks.api.validate.mockResolvedValue({
      validation: { valid: true },
      case: { rowVersion: 3 },
    });
    mocks.api.submit.mockResolvedValue({});
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <NewBusinessPartnerRequest
            initialRequest={
              {
                request,
                case: {
                  definition: { ...definition, contentHash: definition.hash },
                },
              } as any
            }
          />,
        ),
      );
      const button = (text: string) =>
        [...container.querySelectorAll("button")].find(
          (b) => b.textContent === text,
        )!;
      await act(async () =>
        button(submitRequest ? "Continue" : "Save draft").click(),
      );
      expect(mocks.api.patch).toHaveBeenCalledTimes(1);
      const original = mocks.api.patch.mock.calls[0];
      expect(original[1].draftCapture).toBe(!submitRequest);
      expect(button("Retry previous action")).toBeTruthy();
      await act(async () => button("Retry previous action").click());
      expect(mocks.api.patch).toHaveBeenCalledTimes(2);
      expect(mocks.api.patch.mock.calls[1]).toEqual(original);
      expect(mocks.api.create).not.toHaveBeenCalled();
      expect(mocks.api.validate).toHaveBeenCalledTimes(submitRequest ? 1 : 0);
      expect(mocks.api.submit).toHaveBeenCalledTimes(submitRequest ? 1 : 0);
      if (submitRequest)
        expect(mocks.navigate).toHaveBeenCalledWith(
          "/mdg/business-partner/requests/case-1",
          true,
        );
      else
        expect(window.location.pathname).toBe(
          "/mdg/business-partner/requests/case-1/edit",
        );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);
