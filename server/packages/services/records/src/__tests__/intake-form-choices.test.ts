import { expect, it, vi } from "vitest";
import { resolveIntakeFormChoices } from "../intake-form-choices";
const surfaces = [
  {
    schemaVersion: 1,
    key: "details",
    title: "Details",
    columns: 1,
    sections: [
      {
        key: "country",
        fields: ["registered", "address"].map((key) => ({
          control: "input",
          key,
          valueKey: key,
          label: "Country",
          widget: "select",
          required: true,
          columnSpan: 3,
          lookup: {
            sourceKey: "iso.country",
            recent: {
              enabled: true,
              persistence: "server",
              scope: "referenceSource",
              limit: 5,
              retentionDays: 90,
            },
            options: [{ value: "XX", label: "Stale" }],
          },
        })),
      },
    ],
  },
] as any;
it("hydrates from the registered master once, replacing stale authored options", async () => {
  const resolve = vi.fn(async () => [{ value: "DE", label: "Germany" }]);
  const result = await resolveIntakeFormChoices(surfaces, resolve);
  expect((result[0]!.sections[0]!.fields[0] as any).lookup.recent).toEqual(
    surfaces[0].sections[0].fields[0].lookup.recent,
  );
  expect(resolve).toHaveBeenCalledExactlyOnceWith("iso.country");
  expect((result[0]!.sections[0]!.fields[0] as any).lookup.options).toEqual([
    { value: "DE", label: "Germany" },
  ]);
  expect(surfaces[0].sections[0].fields[0].lookup.options[0].value).toBe("XX");
});
it("fails closed without a resolver and for malformed results", async () => {
  await expect(resolveIntakeFormChoices(surfaces)).rejects.toThrow(
    "UNAVAILABLE",
  );
  await expect(
    resolveIntakeFormChoices(surfaces, async () => [
      { value: "DE", label: "Germany" },
      { value: "DE", label: "Duplicate" },
    ]),
  ).rejects.toThrow("INVALID");
});
