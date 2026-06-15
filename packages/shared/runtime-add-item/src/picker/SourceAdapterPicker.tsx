"use client";

import type { DraftLine } from "@athyper/runtime-contracts";
import { OverlayPicker } from "./OverlayPicker";
import { ModalSelectPicker } from "./ModalSelectPicker";
import type { SourceAdapterPickerProps } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// SourceAdapterPicker — picks the right picker variant based on the
// adapter's manifest. Consumers use this as the single entry point and
// don't need to switch on picker.kind themselves.
//
// `entry === "direct_fill"` adapters never reach this component — consumers
// route them through their own composer / fill UI instead.
//
// `picker.kind === "page"` is intentionally unsupported here — page pickers
// are routed destinations that mount as standalone Next.js routes, not as
// floating UI overlaid on the parent. When a page picker is needed, the
// consumer handles the navigation.
// ─────────────────────────────────────────────────────────────────────────────

export function SourceAdapterPicker<
  Selection extends Record<string, unknown>,
  Draft extends DraftLine,
  ParentCtx extends Record<string, unknown>,
>(props: SourceAdapterPickerProps<Selection, Draft, ParentCtx>) {
  const kind = props.adapter.manifest.picker?.kind;
  if (props.adapter.manifest.entry === "direct_fill") {
    // Defensive — should never reach here.
    if (
      typeof process !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process as any).env?.NODE_ENV !== "production"
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `[SourceAdapterPicker] adapter "${props.adapter.manifest.id}" is direct_fill — picker should not be opened`,
      );
    }
    return null;
  }
  if (kind === "overlay") return <OverlayPicker {...props} />;
  if (kind === "modal-select") return <ModalSelectPicker {...props} />;
  if (
    typeof process !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).env?.NODE_ENV !== "production"
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[SourceAdapterPicker] adapter "${props.adapter.manifest.id}" picker.kind="${kind}" is not handled by the framework picker — implement a custom picker for this adapter`,
    );
  }
  return null;
}

declare const process: { env: { NODE_ENV: string } };
