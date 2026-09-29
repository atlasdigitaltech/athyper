/** Browser-safe shared runtime values. Bootstrap resource parsing was removed:
 * no route or runtime consumed that provisional contract. */
import { isObjectRecord, isBoundedNonBlankText } from "./validation/values";

export interface EntityRuntimeLocalizedTextV1 {
  readonly labelKey: string;
  readonly defaultText: string;
}

const keyPattern = /^[a-z][a-z0-9_.-]{0,126}$/;

export function parseEntityRuntimeLocalizedText(
  value: unknown,
): EntityRuntimeLocalizedTextV1 {
  if (!isObjectRecord(value))
    throw new TypeError("localized text must be an object");
  if (
    typeof value.labelKey !== "string" ||
    !keyPattern.test(value.labelKey) ||
    !isBoundedNonBlankText(value.defaultText, 500)
  )
    throw new TypeError("localized text is invalid");
  return Object.freeze({
    labelKey: value.labelKey,
    defaultText: value.defaultText,
  });
}
