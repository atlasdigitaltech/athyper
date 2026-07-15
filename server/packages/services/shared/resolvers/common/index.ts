import { registerPickerFirstOption } from "../picker-first-option.js";

export { registerPickerFirstOption, pickerFirstOptionContract } from "../picker-first-option.js";

export function registerCommonResolvers(): void {
  registerPickerFirstOption();
}
