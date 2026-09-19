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
    submit: vi.fn().mockResolvedValue({}),
  };
  expect(
    (
      await submitBusinessPartnerIntake(
        api as any,
        { id: "case", rowVersion: 3 } as any,
      )
    ).submitted,
  ).toBe(true);
  expect(api.submit).toHaveBeenCalledWith("case", 4);
  api.validate.mockResolvedValue({
    case: { rowVersion: 5 },
    validation: { valid: false },
  });
  api.submit.mockClear();
  expect(
    (
      await submitBusinessPartnerIntake(
        api as any,
        { id: "case", rowVersion: 4 } as any,
      )
    ).submitted,
  ).toBe(false);
  expect(api.submit).not.toHaveBeenCalled();
});
it("keeps the saved case available when submission fails", async () => {
  const api = {
    validate: vi.fn().mockRejectedValue(new Error("Version conflict")),
    submit: vi.fn(),
  };
  const r = await submitBusinessPartnerIntake(
    api as any,
    { id: "case", rowVersion: 3 } as any,
  );
  expect(r.submitted).toBe(false);
  expect(r.detail).toContain("Request saved");
  expect(api.submit).not.toHaveBeenCalled();
});
