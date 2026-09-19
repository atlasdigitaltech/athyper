import type {
  NeonWorkContextBootstrap,
  NeonWorkContextCompany,
} from "@athyper/platform-api-client";

export interface NeonLegalEntity {
  readonly id: string;
  readonly code: string;
  readonly displayName: string;
}

export type WorkSelection = Readonly<
  | { mode: "unresolved" }
  | { mode: "legal_entity"; legalEntityId: string; companyCodeId?: string }
>;

export interface WorkContextState {
  readonly status: "loading" | "ready" | "error";
  readonly switching: boolean;
  readonly generation: number;
  readonly selection: WorkSelection;
  readonly catalog?: NeonWorkContextBootstrap;
  readonly error?: "unavailable" | "invalid_selection";
}

/** V1 discovery is limited to server-admitted company contexts. It grants no LE-wide access. */
export function legalEntities(
  companies: readonly NeonWorkContextCompany[],
): readonly NeonLegalEntity[] {
  return [
    ...new Map(
      companies.map((company) => [
        company.legalEntityId,
        {
          id: company.legalEntityId,
          code: company.legalEntityCode,
          displayName: company.legalEntityName,
        },
      ]),
    ).values(),
  ];
}

export function resolveSelection(
  catalog: NeonWorkContextBootstrap,
  requested: unknown,
): WorkSelection | undefined {
  if (!requested || typeof requested !== "object") return undefined;
  const value = requested as Record<string, unknown>;
  if (value.mode !== "legal_entity" && value.mode !== "company")
    return undefined;
  const company = catalog.companies.find(
    (row) => row.companyCodeId === value.companyCodeId,
  );
  // A legacy company preference supplies its canonical LE, never its stored LE claim.
  const id =
    value.mode === "company" ? company?.legalEntityId : value.legalEntityId;
  const companies = catalog.companies.filter((row) => row.legalEntityId === id);
  if (
    !companies.length ||
    (value.companyCodeId !== undefined &&
      (!company || company.legalEntityId !== id))
  )
    return undefined;
  const companyCodeId =
    company?.companyCodeId ??
    (companies.length === 1 ? companies[0]!.companyCodeId : undefined);
  return {
    mode: "legal_entity",
    legalEntityId: companies[0]!.legalEntityId,
    ...(companyCodeId ? { companyCodeId } : {}),
  };
}

export function initialSelection(
  catalog: NeonWorkContextBootstrap,
  stored: unknown,
): WorkSelection {
  const restored = resolveSelection(catalog, stored);
  if (restored) return restored;
  const entities = legalEntities(catalog.companies);
  return entities.length === 1
    ? resolveSelection(catalog, {
        mode: "legal_entity",
        legalEntityId: entities[0]!.id,
      })!
    : { mode: "unresolved" };
}

export interface ContextPreferenceStore {
  read(): unknown;
  write(value: WorkSelection): void;
}

/** Storage is optional. Legacy all-company preference never becomes an arbitrary LE. */
export function contextPreferenceStore(
  tenantId: string,
  principalId: string,
): ContextPreferenceStore {
  const key = `athyper.neon.work-context.v2:${tenantId}:${principalId}`;
  const legacyKey = `athyper.neon.work-context.v1:${tenantId}:${principalId}`;
  return {
    read() {
      try {
        const current = sessionStorage.getItem(key);
        if (current !== null) return JSON.parse(current);
      } catch {
        return undefined;
      }
      try {
        return JSON.parse(localStorage.getItem(legacyKey) ?? "null");
      } catch {
        return undefined;
      }
    },
    write(value) {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* In-memory context still works. */
      }
    },
  };
}

/** Atomic committed snapshot; cancelled or superseded requests cannot publish state. */
export class NeonWorkContextController {
  private state: WorkContextState = {
    status: "loading",
    switching: false,
    generation: 0,
    selection: { mode: "unresolved" },
  };
  private listeners = new Set<() => void>();
  private request?: AbortController;
  private sequence = 0;

  constructor(
    private readonly options: {
      tenantId: string;
      load(signal: AbortSignal): Promise<NeonWorkContextBootstrap>;
      preferences: ContextPreferenceStore;
    canLeave(target: WorkSelection): boolean | Promise<boolean>;
    },
  ) {}

  getSnapshot = (): WorkContextState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: WorkContextState) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
  dispose() {
    this.sequence++;
    this.request?.abort();
  }

  async refresh(): Promise<void> {
    const sequence = ++this.sequence;
    this.request?.abort();
    const request = (this.request = new AbortController());
    // Refresh hides dependent content until authority is resolved again.
    this.publish({
      ...this.state,
      status: "loading",
      switching: false,
      error: undefined,
    });
    try {
      const catalog = await this.options.load(request.signal);
      if (request.signal.aborted || sequence !== this.sequence) return;
      if (catalog.tenantId !== this.options.tenantId)
        throw new Error("Tenant mismatch");
      const selection = initialSelection(
        catalog,
        this.state.catalog
          ? this.state.selection
          : this.options.preferences.read(),
      );
      this.options.preferences.write(selection);
      this.publish({
        status: "ready",
        switching: false,
        generation: this.state.generation + 1,
        catalog,
        selection,
      });
    } catch {
      if (request.signal.aborted || sequence !== this.sequence) return;
      this.publish({
        ...this.state,
        status: "error",
        switching: false,
        catalog: undefined,
        selection: { mode: "unresolved" },
        error: "unavailable",
      });
    }
  }

  async select(requested: WorkSelection): Promise<boolean> {
    if (this.state.status !== "ready" || !this.state.catalog) return false;
    const candidate = resolveSelection(this.state.catalog, requested);
    if (!candidate) return false;
    if (JSON.stringify(candidate) === JSON.stringify(this.state.selection)) {
      this.sequence++;
      this.request?.abort();
      this.publish({ ...this.state, switching: false, error: undefined });
      return true;
    }
    const sequence = ++this.sequence;
    this.request?.abort();
    const request = (this.request = new AbortController());
    this.publish({ ...this.state, switching: true, error: undefined });
    try {
      const hasActiveWork =
        this.state.selection.mode === "legal_entity" &&
        !!this.state.selection.companyCodeId;
      if (hasActiveWork && !(await this.options.canLeave(candidate))) {
        if (sequence === this.sequence)
          this.publish({ ...this.state, switching: false });
        return false;
      }
      if (request.signal.aborted || sequence !== this.sequence) return false;
      const catalog = await this.options.load(request.signal);
      if (request.signal.aborted || sequence !== this.sequence) return false;
      if (catalog.tenantId !== this.options.tenantId)
        throw new Error("Tenant mismatch");
      const selection = resolveSelection(catalog, requested);
      if (!selection) {
        // A successful refresh can revoke the previous context as well as the candidate.
        const previous = resolveSelection(catalog, this.state.selection);
        const retained = previous ?? ({ mode: "unresolved" } as const);
        this.options.preferences.write(retained);
        this.publish({
          status: "ready",
          switching: false,
          generation: previous
            ? this.state.generation
            : this.state.generation + 1,
          catalog,
          selection: retained,
          error: "invalid_selection",
        });
        return false;
      }
      this.options.preferences.write(selection);
      this.publish({
        status: "ready",
        switching: false,
        generation: this.state.generation + 1,
        catalog,
        selection,
      });
      return true;
    } catch (cause) {
      if (request.signal.aborted || sequence !== this.sequence) return false;
      const status =
        cause && typeof cause === "object"
          ? Reflect.get(cause, "status")
          : undefined;
      if (status === 401 || status === 403) {
        this.options.preferences.write({ mode: "unresolved" });
        this.publish({
          status: "error",
          switching: false,
          generation: this.state.generation + 1,
          selection: { mode: "unresolved" },
          error: "unavailable",
        });
        return false;
      }
      this.publish({ ...this.state, switching: false, error: "unavailable" });
      return false;
    }
  }
}
