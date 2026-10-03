import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./product.js";

const source = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../../metadata/entities/country/definition.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

it.each(["studio", "neon", "mesh"] as const)(
  "publishes Country's own icon to its list and record headers on %s",
  (plane) => {
    const { artifact } = compileSharedReferenceProduct(
      parseSharedReferenceProduct(source()),
      plane,
    );
    const descriptor = artifact.descriptor as {
      listPresentation?: { experience?: { header?: { iconKey?: string } } };
      recordPresentation?: { iconKey?: string };
    };
    expect(descriptor.listPresentation?.experience?.header?.iconKey).toBe("globe");
    expect(descriptor.recordPresentation?.iconKey).toBe("globe");
  },
);

it("an entity without an icon publishes none, so the runtime role fallback applies", () => {
  const product = source();
  delete product.definition.iconKey;
  const { artifact } = compileSharedReferenceProduct(
    parseSharedReferenceProduct(product),
    "neon",
  );
  const descriptor = artifact.descriptor as {
    listPresentation?: { experience?: { header?: { iconKey?: string } } };
    recordPresentation?: { iconKey?: string };
  };
  expect(descriptor.listPresentation?.experience?.header?.iconKey).toBeUndefined();
  expect(descriptor.recordPresentation?.iconKey).toBeUndefined();
});

it.each([["Globe"], [""], [7], ["globe icon"]])("rejects the icon key %j", (iconKey) => {
  const product = source();
  product.definition.iconKey = iconKey;
  expect(() => parseSharedReferenceProduct(product)).toThrow("REFERENCE_PRODUCT_ICON_INVALID");
});
