import { it, expect, vi } from "vitest";
import { submitBusinessPartnerIntake } from "./intake-submit";
it("submits the validated version and never proceeds past failed validation", async () => {
  const api = {
    validate: vi
      .fn()
      .mockResolvedValue({
        case: { rowVersion: 4 },
        validation: { valid: true },
      }),
  };
  const http = { request: vi.fn().mockResolvedValue({}) };
  expect(
    (
      await submitBusinessPartnerIntake(
        api as any,
        http as any, { id: "case", rowVersion: 3 } as any,
      )
    ).submitted,
  ).toBe(true);
  expect(http.request).toHaveBeenCalledOnce();
  api.validate.mockResolvedValue({
    case: { rowVersion: 5 },
    validation: { valid: false },
  });
  http.request.mockClear();
  expect(
    (
      await submitBusinessPartnerIntake(
        api as any,
        http as any, { id: "case", rowVersion: 4 } as any,
      )
    ).submitted,
  ).toBe(false);
  expect(http.request).not.toHaveBeenCalled();
});
it("keeps the saved case available when submission fails", async () => {
  const api = {
    validate: vi.fn().mockRejectedValue(new Error("Version conflict")),
  };
  const http = { request: vi.fn() };
  const r = await submitBusinessPartnerIntake(
    api as any,
    http as any, { id: "case", rowVersion: 3 } as any,
  );
  expect(r.submitted).toBe(false);
  expect(r.detail).toContain("Request saved");
  expect(http.request).not.toHaveBeenCalled();
});
