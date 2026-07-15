import type { LineItemVariantDefinition, LineItemVariantKey } from "./types";

declare const process: { env: { NODE_ENV: string } };

// ─────────────────────────────────────────────────────────────────────────────
// LINE ITEM VARIANT REGISTRY
//
// Singleton that maps line_ui_variant keys (stored in entity display_config)
// to fully-typed variant definitions. Variants register themselves at module
// load time; the registry falls back to "generic" when an unknown key is asked.
// ─────────────────────────────────────────────────────────────────────────────

class LineItemVariantRegistryImpl {
  private readonly _variants = new Map<string, LineItemVariantDefinition>();

  register(definition: LineItemVariantDefinition): void {
    if (this._variants.has(definition.key)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[runtime-line-item] variant "${definition.key}" already registered — overwriting`);
      }
    }
    this._variants.set(definition.key, definition);
  }

  resolve(key: LineItemVariantKey | null | undefined): LineItemVariantDefinition | null {
    if (!key) return this._variants.get("generic") ?? null;
    return this._variants.get(key) ?? this._variants.get("generic") ?? null;
  }

  has(key: string): boolean {
    return this._variants.has(key);
  }

  keys(): string[] {
    return Array.from(this._variants.keys());
  }
}

export const LineItemVariantRegistry = new LineItemVariantRegistryImpl();
