import type { Locator } from "@playwright/test";

/** Picks an option of a design-system ChoiceSelect by its value, the way a
 * person does: open the listbox, then click the option. */
export async function chooseOption(
  combobox: Locator,
  value: string,
): Promise<void> {
  await combobox.click();
  const listbox = await combobox.getAttribute("aria-controls");
  if (!listbox) throw new Error("ChoiceSelect did not open its listbox");
  await combobox
    .page()
    .locator(`[id="${listbox}"] [role=option][data-value="${value}"]`)
    .click();
}
