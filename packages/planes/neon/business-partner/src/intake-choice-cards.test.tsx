// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { EntityIntakeClassification } from "@athyper/platform-entity-form-detail";
import { compileEntityIntakeSurfaces } from "../../../../../server/packages/platform/metadata/src/intake-surface-projection";
import {
  withIntakeChoiceSurface,
  invoiceClassificationSurface,
  businessPartnerRoleSurface,
} from "../../../../../server/db/scripts/provisioning/intake-choice-surfaces";
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(
  entity = "supplier_invoice",
  onContinue = vi.fn(async () => {}),
) {
  const g = withIntakeChoiceSurface(
    { entity: { entityCode: entity }, fields: [], operations: [] } as any,
    entity === "supplier_invoice"
      ? invoiceClassificationSurface
      : businessPartnerRoleSurface,
  );
  const surface = compileEntityIntakeSurfaces(g as any)[0]!;
  await act(async () =>
    root.render(
      <EntityIntakeClassification
        surface={surface}
        descriptorHash="published-1"
        onContinue={onContinue}
      />,
    ),
  );
  return onContinue;
}
const click = async (value: string) =>
  act(async () =>
    container
      .querySelector<HTMLInputElement>(`input[value="${value}"]`)!
      .click(),
  );
const submit = async () =>
  act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[type="submit"]')!
      .click(),
  );
it("renders invoice metadata and hands only validated answers to the adapter", async () => {
  const handler = await render();
  await submit();
  expect(handler).not.toHaveBeenCalled();
  expect(container.querySelectorAll('[role="alert"]').length).toBe(3);
  await click("standard");
  await click("non_po");
  await click("existing");
  await submit();
  expect(handler).toHaveBeenCalledWith({
    surfaceKey: "intake_classification",
    descriptorHash: "published-1",
    answers: {
      invoice_type: "standard",
      invoice_basis: "non_po",
      supplier_relationship: "existing",
    },
  });
});
it("uses the same renderer for Business Partners", async () => {
  const handler = await render("business_partner");
  expect(
    [...container.querySelectorAll("legend")].map((n) => n.textContent),
  ).toEqual([`${businessPartnerRoleSurface.sections[0]!.fields[0]!.label} *`]);
  await click("supplier");
  await submit();
  expect(handler.mock.calls[0]).toEqual([
    {
      surfaceKey: "intake_partner",
      descriptorHash: "published-1",
      answers: { requested_role: "supplier" },
    },
  ]);
});
it("retains answers on handler failure and prevents concurrent handoffs", async () => {
  let reject!: (error: Error) => void;
  const handler = vi.fn(
    () =>
      new Promise<void>((_, r) => {
        reject = r;
      }),
  );
  await render("business_partner", handler);
  await click("customer");
  await submit();
  await submit();
  expect(handler).toHaveBeenCalledTimes(1);
  await act(async () => reject(Error("Reference service unavailable")));
  expect(container.textContent).toContain("Reference service unavailable");
  expect(
    container.querySelector<HTMLInputElement>('input[value="customer"]')!
      .checked,
  ).toBe(true);
});

it("renders authored presentation presets without changing choice behavior", async () => {
  const handler = await render("business_partner");
  const cards = container.querySelector("fieldset")!;
  expect(cards.dataset.layout).toBe("grid");
  expect(cards.dataset.optionColumns).toBe("2");
  expect(cards.dataset.density).toBe("compact");
  await click("supplier");
  await click("customer");
  expect(container.querySelectorAll("input:checked")).toHaveLength(1);
  await submit();
  expect(handler).toHaveBeenCalledWith(
    expect.objectContaining({ answers: { requested_role: "customer" } }),
  );
});
