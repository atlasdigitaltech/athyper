// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import {
  RequestAttachmentField,
  RequestAttachmentScope,
} from "./request-attachment-field";
const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => http,
}));
const field = {
  control: "input",
  key: "file",
  valueKey: "attachmentId",
  label: "Supporting file",
  required: true,
  columnSpan: 12,
  widget: "registered",
  handlerKey: "business_partner.attachment",
  attachmentLabels: {
    uploading: "Uploading",
    attached: "Attached",
    unavailable: "Unavailable",
    uploadFailed: "Failed",
    processing: "Processing",
    selectExisting: "Select existing",
  },
} as const;
it("attaches only a finalized active upload and omits credentials on signed storage requests", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const request = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", request);
  http.request
    .mockReset()
    .mockResolvedValueOnce({
      attachmentId: "11111111-1111-4111-8111-111111111111",
      uploadUrl: "https://storage.test/upload",
    })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ status: "active" });
  const element = document.createElement("div"),
    root = createRoot(element),
    onChange = vi.fn();
  try {
    await act(async () =>
      root.render(
        <RequestAttachmentField
          field={field}
          value=""
          onChange={onChange}
          id="file"
          name="file"
          disabled={false}
        />,
      ),
    );
    const input = element.querySelector('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      value: [
        new File(["test"], "certificate.pdf", { type: "application/pdf" }),
      ],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onChange).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(request).toHaveBeenCalledWith(
      "https://storage.test/upload",
      expect.objectContaining({ credentials: "omit", method: "PUT" }),
    );
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it("does not accept an upload still processing", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  http.request
    .mockReset()
    .mockResolvedValueOnce({
      attachmentId: "11111111-1111-4111-8111-111111111111",
      uploadUrl: "https://storage.test/upload",
    })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ status: "processing" });
  const element = document.createElement("div"),
    root = createRoot(element),
    onChange = vi.fn();
  try {
    await act(async () =>
      root.render(
        <RequestAttachmentField
          field={field}
          value=""
          onChange={onChange}
          id="file"
          name="file"
          disabled={false}
        />,
      ),
    );
    const input = element.querySelector('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      value: [new File(["test"], "certificate.pdf")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(element.textContent).toContain("Processing");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("reports failed uploads to the draft and releases the blocker when its entry is removed", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  http.request.mockReset().mockRejectedValue(new Error("Upload failed"));
  const element = document.createElement("div"),
    root = createRoot(element),
    readiness = vi.fn();
  try {
    await act(async () =>
      root.render(
        <RequestAttachmentScope onReadinessChange={readiness}>
          <RequestAttachmentField
            field={field}
            value=""
            onChange={() => {}}
            id="blocked-file"
            name="file"
            disabled={false}
          />
        </RequestAttachmentScope>,
      ),
    );
    const input = element.querySelector('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      value: [new File(["test"], "certificate.pdf")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(readiness).toHaveBeenLastCalledWith(["Upload failed"]);
    await act(async () =>
      root.render(
        <RequestAttachmentScope onReadinessChange={readiness}>
          {null}
        </RequestAttachmentScope>,
      ),
    );
    expect(readiness).toHaveBeenLastCalledWith([]);
  } finally {
    await act(async () => root.unmount());
  }
});

it("explains upload denial and disables repeated uploads", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const { ApiTransportError } = await import("@athyper/platform-api-client");
  http.request
    .mockReset()
    .mockRejectedValue(
      new ApiTransportError("authorization", "Internal permission key", 403),
    );
  const element = document.createElement("div"),
    root = createRoot(element),
    onChange = vi.fn();
  const deniedField = {
    ...field,
    attachmentLabels: {
      ...field.attachmentLabels,
      uploadNotAllowed:
        "Upload access is required. Select an existing document.",
    },
  };
  try {
    await act(async () =>
      root.render(
        <RequestAttachmentField
          field={deniedField}
          value=""
          onChange={onChange}
          id="denied"
          name="denied"
          disabled={false}
        />,
      ),
    );
    const input =
      element.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      value: [new File(["test"], "proof.pdf")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(input.disabled).toBe(true);
    expect(element.textContent).toContain("Upload access is required");
    expect(element.textContent).not.toContain("Internal permission key");
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});
