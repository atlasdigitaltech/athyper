import { describe, expect, it } from "vitest";
import {
  PICKER_SURFACE_KINDS,
  SourceAdapterManifestSchema,
} from "@athyper/runtime-contracts";
import type {
  DraftLine,
  SourceAdapterId,
} from "@athyper/runtime-contracts";
import type { SourceAdapter, SourceQuery } from "../adapter/types";
import { CURRENT_FRAMEWORK_VERSION, SourceAdapterRegistry } from "../adapter/registry";

// ─────────────────────────────────────────────────────────────────────────────
// defineSourceAdapterContractSuite — every SourceAdapter implementation runs
// this suite to prove it honors the framework contract. Industry packs ship
// their own adapter + a one-liner that invokes this suite with their fixtures.
//
// The suite covers:
//   • Manifest validity (Zod schema)
//   • Framework-version compatibility
//   • Picker kind is one of the picker-eligible surfaces
//   • toDraftShape produces a draft whose sourceBinding.sourceType matches
//     the adapter id (load-bearing for the committer)
//   • resolveDefaults preserves sourceBinding
//   • applyParentContext preserves sourceBinding + does not drop ids
//   • dedupeKey returns a non-empty stable string
//   • validateSelection runs (ok/!ok branch)
//   • isStillValid runs (ok/!ok branch)
//   • Side effects are declarative — onCommitSideEffects returns a serializable array
//   • Registry accepts the adapter
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceAdapterContractFixtures<
  Selection extends Record<string, unknown>,
  Draft extends DraftLine,
  ParentCtx extends Record<string, unknown>,
> {
  parentCtx: ParentCtx;
  validQuery: SourceQuery;
  validSelection: Selection;
  /** Selection that should fail validateSelection. */
  invalidSelection?: Selection;
  /**
   * A staged draft that has gone stale since staging — used to assert
   * isStillValid returns ok:false. Optional: not every adapter has
   * staleness semantics.
   */
  staleStagedLine?: Draft;
}

export interface SourceAdapterContractOptions {
  /** Override the framework version used for compat assertions. */
  frameworkVersion?: number;
}

export function defineSourceAdapterContractSuite<
  Selection extends Record<string, unknown>,
  Draft extends DraftLine,
  ParentCtx extends Record<string, unknown>,
>(
  name: string,
  adapterFactory: () => SourceAdapter<Selection, Draft, ParentCtx>,
  fixtures: SourceAdapterContractFixtures<Selection, Draft, ParentCtx>,
  options: SourceAdapterContractOptions = {},
): void {
  const frameworkVersion = options.frameworkVersion ?? CURRENT_FRAMEWORK_VERSION;

  describe(`SourceAdapter contract — ${name}`, () => {
    it("manifest passes SourceAdapterManifestSchema", () => {
      const adapter = adapterFactory();
      const parsed = SourceAdapterManifestSchema.safeParse(adapter.manifest);
      expect(parsed.success).toBe(true);
    });

    it("manifest.minFrameworkVersion is supported", () => {
      const adapter = adapterFactory();
      expect(adapter.manifest.minFrameworkVersion).toBeLessThanOrEqual(frameworkVersion);
    });

    it("picker.kind is one of the picker-eligible surfaces (skipped for direct_fill)", () => {
      const adapter = adapterFactory();
      if (adapter.manifest.entry === "direct_fill") {
        // direct_fill adapters have no picker — the fill UI IS the selection.
        expect(adapter.manifest.picker).toBeUndefined();
        return;
      }
      const kind = adapter.manifest.picker?.kind;
      expect(kind).toBeDefined();
      expect(PICKER_SURFACE_KINDS.has(kind!)).toBe(true);
    });

    it("registry accepts the adapter", () => {
      const adapter = adapterFactory();
      const registry = new SourceAdapterRegistry();
      const result = registry.register(adapter);
      expect(result.ok).toBe(true);
    });

    it("fetch returns a Page shape", async () => {
      const adapter = adapterFactory();
      const page = await adapter.fetch(fixtures.validQuery, fixtures.parentCtx);
      expect(Array.isArray(page.items)).toBe(true);
    });

    it("toDraftShape sets sourceBinding.sourceType to adapter.manifest.id", () => {
      const adapter = adapterFactory();
      const draft = adapter.toDraftShape(fixtures.validSelection, fixtures.parentCtx);
      expect(draft.sourceBinding.sourceType).toBe(adapter.manifest.id);
    });

    it("resolveDefaults preserves sourceBinding", async () => {
      const adapter = adapterFactory();
      const draft = adapter.toDraftShape(fixtures.validSelection, fixtures.parentCtx);
      const resolved = await adapter.resolveDefaults(draft, fixtures.parentCtx);
      expect(resolved.sourceBinding.sourceType).toBe(adapter.manifest.id);
    });

    it("applyParentContext preserves sourceBinding", () => {
      const adapter = adapterFactory();
      const draft = adapter.toDraftShape(fixtures.validSelection, fixtures.parentCtx);
      const applied = adapter.applyParentContext(draft, fixtures.parentCtx);
      expect(applied.sourceBinding.sourceType).toBe(adapter.manifest.id);
    });

    it("validateSelection accepts the valid fixture", () => {
      const adapter = adapterFactory();
      const result = adapter.validateSelection(fixtures.validSelection, fixtures.parentCtx);
      expect(result.ok).toBe(true);
    });

    if (fixtures.invalidSelection !== undefined) {
      it("validateSelection rejects the invalid fixture", () => {
        const adapter = adapterFactory();
        const result = adapter.validateSelection(fixtures.invalidSelection!, fixtures.parentCtx);
        expect(result.ok).toBe(false);
      });
    }

    if (fixtures.staleStagedLine !== undefined) {
      it("isStillValid rejects the stale fixture", async () => {
        const adapter = adapterFactory();
        const result = await adapter.isStillValid(
          fixtures.staleStagedLine!,
          fixtures.parentCtx,
        );
        expect(result.ok).toBe(false);
      });
    }

    it("onCommitSideEffects returns a declarative array (no thrown errors)", () => {
      const adapter = adapterFactory();
      const draft = adapter.toDraftShape(fixtures.validSelection, fixtures.parentCtx);
      const effects = adapter.onCommitSideEffects(draft, fixtures.parentCtx);
      expect(Array.isArray(effects)).toBe(true);
      for (const e of effects) {
        expect(typeof e.kind).toBe("string");
      }
    });

    it("dedupeKeys is populated (composite-safe)", () => {
      const adapter = adapterFactory();
      expect(adapter.manifest.dedupeKeys.length).toBeGreaterThan(0);
    });

    it("optional dedupeKey() — when implemented — returns a non-empty string", () => {
      const adapter = adapterFactory();
      if (!adapter.dedupeKey) return; // optional override
      const draft = adapter.toDraftShape(fixtures.validSelection, fixtures.parentCtx);
      const key = adapter.dedupeKey(draft, fixtures.parentCtx);
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });

    it("adapter id parses as a valid SourceAdapterId", () => {
      const adapter = adapterFactory();
      const id: SourceAdapterId = adapter.manifest.id;
      // The runtime regex is already enforced by SourceAdapterManifestSchema
      // above; this assertion documents the contract surface.
      expect(id).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/);
    });
  });
}

// Re-export PICKER_SURFACE_KINDS so the test harness file is self-contained
// when consumers import it.
export { PICKER_SURFACE_KINDS };
