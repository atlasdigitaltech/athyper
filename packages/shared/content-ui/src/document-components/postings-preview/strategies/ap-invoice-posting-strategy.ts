/**
 * @athyper/content-ui — AP Invoice posting strategy handle.
 *
 * PREVIEW ONLY (amendment 11).
 *
 * Today this is a minimal handle that identifies the strategy by code.
 * The full strategy contract (deriveHeaderRows, adAggregationSide,
 * accountLabels) extends this when the postingsPreviewBuilder gets
 * refactored to accept strategies. Until then, the existing builder's
 * AP-hardcoded logic IS the AP strategy — the builder file's header
 * comment explicitly says so.
 *
 * This handle exists now so the registry mechanism can be wired and
 * the descriptor seed can reference a registered code (without a
 * "missing strategy" error).
 */

import type { PostingStrategy } from "./types";

export const apInvoicePostingStrategy: PostingStrategy = {
  code:         "ap_invoice",
  kind:         "preview",
  preview_only: true,
  description:
    "AP invoice preview: DR account aggregation from AD; CR rows derived "
    + "from header fields (payable / retention / withholding); tax PC rows "
    + "split into recoverable / cost-of-goods. Current logic lives in "
    + "postingsPreviewBuilder.ts; future refactor extracts into this module.",
};
