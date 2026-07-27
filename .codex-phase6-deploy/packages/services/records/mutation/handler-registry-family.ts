export type EntityHandlerRegistryKind =
  | "mutation"
  | "write_facade"
  | "entity_operation"
  | "lifecycle_command"
  | "child_effect"
  | "child_defaults"
  | "child_refresh"
  | "child_delete";

/**
 * One duplicate-safe registry family for every durable mutation extension.
 * Typed adapters remain in their domain modules; storage and health reporting
 * are centralized here.
 */
export class ValidatedEntityHandlerRegistryFamily {
  private readonly registries = new Map<EntityHandlerRegistryKind, Map<string, unknown>>();

  register<T>(kind: EntityHandlerRegistryKind, key: string, handler: T): void {
    const normalized = normalizeHandlerKey(key);
    const registry = this.registry(kind);
    if (registry.has(normalized)) throw new Error(`Duplicate ${kind} handler registration: ${normalized}`);
    registry.set(normalized, handler);
  }

  resolve<T>(kind: EntityHandlerRegistryKind, key: string): T | undefined {
    return this.registry(kind).get(normalizeHandlerKey(key)) as T | undefined;
  }

  list(kind: EntityHandlerRegistryKind): string[] {
    return [...this.registry(kind).keys()].sort();
  }

  clear(kind: EntityHandlerRegistryKind): void {
    this.registry(kind).clear();
  }

  health(): Readonly<Record<EntityHandlerRegistryKind, readonly string[]>> {
    return Object.freeze({
      mutation: this.list("mutation"),
      write_facade: this.list("write_facade"),
      entity_operation: this.list("entity_operation"),
      lifecycle_command: this.list("lifecycle_command"),
      child_effect: this.list("child_effect"),
      child_defaults: this.list("child_defaults"),
      child_refresh: this.list("child_refresh"),
      child_delete: this.list("child_delete"),
    });
  }

  private registry(kind: EntityHandlerRegistryKind): Map<string, unknown> {
    let registry = this.registries.get(kind);
    if (!registry) {
      registry = new Map();
      this.registries.set(kind, registry);
    }
    return registry;
  }
}

export const entityHandlerRegistryFamily = new ValidatedEntityHandlerRegistryFamily();

function normalizeHandlerKey(value: string): string {
  const key = value.trim();
  if (!key) throw new Error("Handler registry keys must not be empty.");
  return key;
}
