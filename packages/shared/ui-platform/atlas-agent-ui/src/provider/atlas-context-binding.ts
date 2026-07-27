export interface AtlasContextBinding {
  readonly entityType: string;
  readonly entityId: string;
}

interface RegisteredBinding {
  readonly binding: AtlasContextBinding;
  readonly route: string;
  readonly order: number;
}

const ENTITY_TYPE_RE = /^[a-z][a-z0-9_]{0,63}$/;
const ENTITY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

/**
 * Tokenized, provider-local registry. The newest nested surface wins; removing
 * it reveals the prior page registration without deleting unrelated tokens.
 */
export class AtlasContextBindingRegistry {
  private readonly registrations = new Map<symbol, RegisteredBinding>();
  private order = 0;

  register(binding: AtlasContextBinding, route: string): symbol {
    const token = Symbol("atlas-context-binding");
    this.registrations.set(token, {
      binding: normalizeAtlasContextBinding(binding),
      route: normalizeRoute(route),
      order: ++this.order,
    });
    return token;
  }

  unregister(token: symbol): void {
    this.registrations.delete(token);
  }

  clear(): void {
    this.registrations.clear();
  }

  snapshot(route: string): AtlasContextBinding | null {
    const normalizedRoute = normalizeRoute(route);
    let selected: RegisteredBinding | undefined;
    for (const registration of this.registrations.values()) {
      if (registration.route !== normalizedRoute) continue;
      if (!selected || registration.order > selected.order) {
        selected = registration;
      }
    }
    return selected ? Object.freeze({ ...selected.binding }) : null;
  }
}

export function normalizeAtlasContextBinding(
  value: AtlasContextBinding,
): AtlasContextBinding {
  const entityType = value.entityType.trim().replace(/-/g, "_");
  const entityId = value.entityId.trim();
  if (!ENTITY_TYPE_RE.test(entityType)) {
    throw new Error("Atlas context entityType is malformed or oversized.");
  }
  if (!ENTITY_ID_RE.test(entityId)) {
    throw new Error("Atlas context entityId is malformed or oversized.");
  }
  return Object.freeze({ entityType, entityId });
}

export function currentAtlasRoute(): string {
  return normalizeRoute(window.location.pathname);
}

function normalizeRoute(route: string): string {
  const normalized = route.trim();
  if (!/^\/[^\u0000-\u001f\u007f]{0,499}$/.test(normalized)) {
    throw new Error("Atlas route context is malformed or oversized.");
  }
  return normalized;
}
