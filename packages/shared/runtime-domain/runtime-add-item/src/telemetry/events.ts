import type {
  SourceAdapterId,
  StalenessStrategy,
} from "@athyper/runtime-contracts";

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry events — emitted by the controller / registry at well-known
// points so apps can wire to GlitchTip / Sentry / OTel without each adapter
// taking on telemetry dependencies. All events carry a stable shape and a
// monotonically increasing `seq` for ordering across async operations.
// ─────────────────────────────────────────────────────────────────────────────

export interface BaseEvent {
  /** Monotonically-increasing sequence number for ordering. */
  seq: number;
  /** Wall-clock milliseconds since epoch. */
  at: number;
}

export type AddItemTelemetryEvent =
  | (BaseEvent & {
      type: "adapter.register";
      adapterId: SourceAdapterId;
      version: number;
    })
  | (BaseEvent & {
      type: "adapter.reject";
      adapterId: SourceAdapterId;
      reason: string;
      code:
        | "duplicate_id"
        | "framework_version_too_low"
        | "invalid_manifest"
        | "invalid_picker_kind";
    })
  | (BaseEvent & {
      type: "picker.open";
      adapterId: SourceAdapterId;
    })
  | (BaseEvent & {
      type: "picker.fetch.ok";
      adapterId: SourceAdapterId;
      durationMs: number;
      itemCount: number;
    })
  | (BaseEvent & {
      type: "picker.fetch.fail";
      adapterId: SourceAdapterId;
      durationMs: number;
      error: string;
    })
  | (BaseEvent & {
      type: "commit.ok";
      adapterIds: SourceAdapterId[];
      lineCount: number;
    })
  | (BaseEvent & {
      type: "commit.fail";
      adapterIds: SourceAdapterId[];
      error: string;
    })
  | (BaseEvent & {
      type: "commit.stale";
      adapterId: SourceAdapterId;
      strategy: StalenessStrategy;
      lineCount: number;
    });

export type TelemetryListener = (event: AddItemTelemetryEvent) => void;
