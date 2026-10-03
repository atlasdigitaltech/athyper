import { expect, it } from "vitest";
import { validateReferencePresentation } from "./reference-presentation.js";
const label = {
  labelKey: "reference.unavailable",
  defaultText: "Reference unavailable or not permitted",
};
it.each(["coverage", "shipment_destinations"])(
  "accepts explicitly unavailable nested references for %s",
  (key) => {
    expect(() =>
      validateReferencePresentation([
        {
          key,
          dataType: "json",
          display: {
            itemFields: [
              {
                key: "target",
                dataType: "uuid",
                display: { unavailableReference: label },
              },
            ],
          },
        },
      ]),
    ).not.toThrow();
  },
);
it.each([
  { dataType: "string", display: { unavailableReference: label } },
  {
    dataType: "uuid",
    display: { unavailableReference: { labelKey: "x", defaultText: "" } },
  },
  {
    dataType: "uuid",
    display: {
      unavailableReference: label,
      lookup: { code: "private.targets" },
    },
  },
  {
    dataType: "uuid",
    display: { unavailableReference: label, attachmentDownload: true },
  },
])(
  "rejects conflicting or malformed unavailable-reference configuration",
  (field) => {
    expect(() =>
      validateReferencePresentation([
        { key: "rows", display: { itemFields: [field] } },
      ]),
    ).toThrow("Invalid unavailable reference display");
  },
);
