// ─────────────────────────────────────────────────────────────────────────────
// Interaction surfaces — six typed shells (./shells) hosted by a stack-aware
// controller (./stack). Lives in @athyper/ui because shells are UI primitives;
// runtime semantics (AddItemController, SourceAdapterRegistry, etc.) sit in
// runtime-canvas and consume from here.
// ─────────────────────────────────────────────────────────────────────────────

export * from "./shells";
export * from "./stack";
