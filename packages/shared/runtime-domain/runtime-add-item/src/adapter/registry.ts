import {
  SourceAdapterManifestSchema,
  type SourceAdapterId,
} from "@athyper/runtime-contracts";
import type { SourceAdapter } from "./types";
import type { TelemetryDispatcher } from "../telemetry";

// ─────────────────────────────────────────────────────────────────────────────
// SourceAdapterRegistry — holds the live set of registered adapters,
// validates the manifest at register-time, and gates discovery by
// permission. The registry is a plain class (no React) so it can be wired
// at app boot before the React tree mounts.
//
// Framework-version policy: the registry pins its own contract version
// (CURRENT_FRAMEWORK_VERSION). Adapters declare `minFrameworkVersion`;
// adapters needing a newer framework are rejected with a structured error.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Framework version exposed to adapters. Bumped when AddItemController's
 * public contract changes (new hook signature, new lifecycle, etc.).
 * Adapter manifests gate their `minFrameworkVersion` against this.
 */
export const CURRENT_FRAMEWORK_VERSION = 1 as const;

export interface RegisterContext {
  /**
   * Permission checker — given a permission code, returns true if the
   * current user has it. The picker chooser uses this to hide adapters
   * the user can't invoke.
   */
  hasPermission?: (code: string) => boolean;
  /** Optional telemetry dispatcher for register / reject events. */
  telemetry?: TelemetryDispatcher;
}

export interface RegisterResult {
  ok: boolean;
  error?: {
    code:
      | "duplicate_id"
      | "framework_version_too_low"
      | "invalid_manifest"
      | "invalid_picker_kind";
    message: string;
  };
}

export class SourceAdapterRegistry {
  private adapters = new Map<SourceAdapterId, SourceAdapter>();
  private telemetry: TelemetryDispatcher | undefined;

  constructor(opts: { telemetry?: TelemetryDispatcher } = {}) {
    this.telemetry = opts.telemetry;
  }

  /**
   * Register an adapter. Manifest is re-validated via Zod (cheap insurance
   * against runtime tampering) and the framework version is compared. On
   * failure, emits an `adapter.reject` telemetry event with a structured
   * reason and returns `{ ok: false, error }`. On success, the adapter is
   * available to `get()` / `list()`.
   */
  register(adapter: SourceAdapter): RegisterResult {
    const id = adapter.manifest.id;

    // Defense-in-depth — re-validate manifest at register time.
    const parsed = SourceAdapterManifestSchema.safeParse(adapter.manifest);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      this.emit("adapter.reject", {
        adapterId: id,
        reason: message,
        code: "invalid_manifest",
      });
      return { ok: false, error: { code: "invalid_manifest", message } };
    }

    // Duplicate id check.
    if (this.adapters.has(id)) {
      const message = `Source adapter "${id}" is already registered`;
      this.emit("adapter.reject", {
        adapterId: id,
        reason: message,
        code: "duplicate_id",
      });
      return { ok: false, error: { code: "duplicate_id", message } };
    }

    // Framework version check — adapter cannot require a newer framework.
    if (adapter.manifest.minFrameworkVersion > CURRENT_FRAMEWORK_VERSION) {
      const message =
        `Source adapter "${id}" requires framework version ` +
        `${adapter.manifest.minFrameworkVersion}, but live framework is ` +
        `${CURRENT_FRAMEWORK_VERSION}`;
      this.emit("adapter.reject", {
        adapterId: id,
        reason: message,
        code: "framework_version_too_low",
      });
      return {
        ok: false,
        error: { code: "framework_version_too_low", message },
      };
    }

    this.adapters.set(id, adapter);
    this.emit("adapter.register", {
      adapterId: id,
      version: adapter.manifest.version,
    });
    return { ok: true };
  }

  /** Look up a registered adapter by id. Returns undefined if absent. */
  get(id: SourceAdapterId): SourceAdapter | undefined {
    return this.adapters.get(id);
  }

  has(id: SourceAdapterId): boolean {
    return this.adapters.has(id);
  }

  /**
   * List registered adapters, optionally filtered by the supplied permission
   * checker. The picker chooser uses this to render available sources.
   */
  list(ctx: { hasPermission?: (code: string) => boolean } = {}): SourceAdapter[] {
    const all = Array.from(this.adapters.values());
    if (!ctx.hasPermission) return all;
    return all.filter((a) => {
      const code = a.manifest.permissionCode;
      if (!code) return true;
      return ctx.hasPermission!(code);
    });
  }

  /** Set of all registered adapter ids — useful for descriptor validation. */
  knownIds(): ReadonlySet<SourceAdapterId> {
    return new Set(this.adapters.keys());
  }

  /** Remove an adapter (mostly useful in tests). */
  unregister(id: SourceAdapterId): boolean {
    return this.adapters.delete(id);
  }

  /** Total registered adapter count. */
  get size(): number {
    return this.adapters.size;
  }

  private emit(
    type: "adapter.register" | "adapter.reject",
    payload:
      | { adapterId: SourceAdapterId; version: number }
      | {
          adapterId: SourceAdapterId;
          reason: string;
          code:
            | "duplicate_id"
            | "framework_version_too_low"
            | "invalid_manifest"
            | "invalid_picker_kind";
        },
  ): void {
    if (!this.telemetry) return;
    if (type === "adapter.register") {
      const p = payload as { adapterId: SourceAdapterId; version: number };
      this.telemetry.emit({ type, adapterId: p.adapterId, version: p.version });
    } else {
      const p = payload as {
        adapterId: SourceAdapterId;
        reason: string;
        code:
          | "duplicate_id"
          | "framework_version_too_low"
          | "invalid_manifest"
          | "invalid_picker_kind";
      };
      this.telemetry.emit({
        type,
        adapterId: p.adapterId,
        reason: p.reason,
        code: p.code,
      });
    }
  }
}
