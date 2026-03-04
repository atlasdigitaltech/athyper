/**
 * Persona Registry Service
 *
 * Centralized persona lookup with DB-driven priority resolution.
 * Replaces all hardcoded priority arrays/maps in PersonaCapabilityService
 * and RoleBindingService.
 *
 * Priority convention: higher number = more privileged (matches DB seed).
 *   viewer=10 < reporter=20 < ... < tenant_admin=100
 *
 * Caches persona list with a 5-minute TTL (consistent with other IAM caches).
 * Falls back to FALLBACK_PRIORITIES when the DB is unreachable.
 */

import { PERSONA_CODES } from "./types.js";

import type { IPersonaCapabilityRepository } from "./persona-capability.repository.js";
import type { Persona, PersonaCode, ScopeMode } from "./types.js";
import type { Logger } from "../../../../../kernel/logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hardcoded fallback used when the DB is unreachable.
 * Priority: higher number = more privileged.
 */
const FALLBACK_PRIORITIES: ReadonlyMap<PersonaCode, FallbackPersona> = new Map([
  ["viewer", { priority: 10, scopeMode: "tenant" as ScopeMode }],
  ["reporter", { priority: 20, scopeMode: "tenant" as ScopeMode }],
  ["requester", { priority: 30, scopeMode: "tenant" as ScopeMode }],
  ["agent", { priority: 40, scopeMode: "ou" as ScopeMode }],
  ["manager", { priority: 50, scopeMode: "ou" as ScopeMode }],
  ["module_admin", { priority: 60, scopeMode: "module" as ScopeMode }],
  ["tenant_admin", { priority: 100, scopeMode: "tenant" as ScopeMode }],
]);

interface FallbackPersona {
  priority: number;
  scopeMode: ScopeMode;
}

/**
 * Mapping from DB camelCase codes → canonical snake_case PersonaCode.
 * The DB seed stores "moduleAdmin" and "tenantAdmin" but the type system
 * and all application code uses "module_admin" and "tenant_admin".
 */
const DB_CODE_NORMALIZATION: Record<string, PersonaCode> = {
  moduleAdmin: "module_admin",
  tenantAdmin: "tenant_admin",
  moduleadmin: "module_admin",
  tenantadmin: "tenant_admin",
};

/**
 * Mapping from common role aliases → canonical PersonaCode.
 * Covers IdP role names, legacy codes, and informal variations.
 */
const ROLE_ALIAS_MAP: Readonly<Record<string, PersonaCode>> = {
  // Direct canonical codes (lowercase)
  viewer: "viewer",
  reporter: "reporter",
  requester: "requester",
  agent: "agent",
  manager: "manager",
  module_admin: "module_admin",
  tenant_admin: "tenant_admin",

  // camelCase variants (from DB seed or IdP)
  moduleadmin: "module_admin",
  tenantadmin: "tenant_admin",
  moduleAdmin: "module_admin",
  tenantAdmin: "tenant_admin",

  // Common synonyms
  admin: "tenant_admin",
  administrator: "tenant_admin",
  supervisor: "manager",
  processor: "agent",
  user: "requester",
  analyst: "reporter",
  readonly: "viewer",
  guest: "viewer",
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class PersonaRegistryService {
  private readonly repo: IPersonaCapabilityRepository;
  private readonly logger: Logger;
  private readonly cacheTtlMs: number;

  /** Cached persona list (from DB). */
  private cachedPersonas: Persona[] | null = null;
  private cacheExpiresAt = 0;

  /** Lookup map: normalized PersonaCode → Persona. Rebuilt on cache refresh. */
  private personaMap: Map<PersonaCode, Persona> = new Map();

  constructor(
    repo: IPersonaCapabilityRepository,
    logger: Logger,
    options?: { cacheTtlMs?: number },
  ) {
    this.repo = repo;
    this.logger = logger;
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Get all personas (cached, from DB).
   * Persona codes are normalized to snake_case PersonaCode.
   */
  async getPersonas(): Promise<Persona[]> {
    return this.loadPersonas();
  }

  /**
   * Get a single persona by code.
   * Accepts both canonical codes and DB camelCase variants.
   */
  async getPersona(code: string): Promise<Persona | null> {
    await this.loadPersonas();
    const normalized = this.normalizeCode(code);
    return normalized ? (this.personaMap.get(normalized) ?? null) : null;
  }

  /**
   * Get the scope_mode for a persona.
   */
  async getScopeMode(code: string): Promise<ScopeMode | null> {
    const persona = await this.getPersona(code);
    if (persona) return persona.scopeMode;

    // Fallback
    const normalized = this.normalizeCode(code);
    if (normalized) {
      return FALLBACK_PRIORITIES.get(normalized)?.scopeMode ?? null;
    }
    return null;
  }

  /**
   * Get the DB priority for a persona.
   * Higher = more privileged.
   */
  async getPriority(code: string): Promise<number | null> {
    const persona = await this.getPersona(code);
    if (persona) return persona.priority;

    const normalized = this.normalizeCode(code);
    if (normalized) {
      return FALLBACK_PRIORITIES.get(normalized)?.priority ?? null;
    }
    return null;
  }

  /**
   * Resolve the effective (most privileged) persona from a set of role codes.
   *
   * Higher DB priority = more privileged → we pick the max.
   *
   * @param roleCodes - Role codes from IdP, session, or role bindings.
   * @returns The most privileged PersonaCode the subject qualifies for, or "viewer" as default.
   */
  async resolveEffectivePersona(roleCodes: string[]): Promise<PersonaCode> {
    await this.loadPersonas();

    let bestPersona: PersonaCode = "viewer";
    let bestPriority = -1;

    for (const role of roleCodes) {
      const normalized = this.normalizeCode(role.toLowerCase());
      if (!normalized) continue;

      const persona = this.personaMap.get(normalized);
      const priority =
        persona?.priority ?? FALLBACK_PRIORITIES.get(normalized)?.priority ?? 0;

      if (priority > bestPriority) {
        bestPriority = priority;
        bestPersona = normalized;
      }
    }

    return bestPersona;
  }

  /**
   * Get all personas a set of role codes qualifies for, sorted by priority
   * (most privileged first).
   */
  async getQualifiedPersonas(roleCodes: string[]): Promise<PersonaCode[]> {
    await this.loadPersonas();

    const matched = new Set<PersonaCode>();
    for (const role of roleCodes) {
      const normalized = this.normalizeCode(role.toLowerCase());
      if (normalized) matched.add(normalized);
    }

    // Sort by priority descending (most privileged first)
    return Array.from(matched).sort((a, b) => {
      const aPriority =
        this.personaMap.get(a)?.priority ??
        FALLBACK_PRIORITIES.get(a)?.priority ??
        0;
      const bPriority =
        this.personaMap.get(b)?.priority ??
        FALLBACK_PRIORITIES.get(b)?.priority ??
        0;
      return bPriority - aPriority;
    });
  }

  /**
   * Invalidate the cached personas. Next call to any method will reload from DB.
   */
  invalidateCache(): void {
    this.cachedPersonas = null;
    this.cacheExpiresAt = 0;
    this.personaMap.clear();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Load personas from DB with caching.
   * Falls back to FALLBACK_PRIORITIES on DB failure.
   */
  private async loadPersonas(): Promise<Persona[]> {
    const now = Date.now();
    if (this.cachedPersonas && now < this.cacheExpiresAt) {
      return this.cachedPersonas;
    }

    try {
      const dbPersonas = await this.repo.getPersonas();
      const normalized = this.normalizeDbPersonas(dbPersonas);
      this.cachedPersonas = normalized;
      this.cacheExpiresAt = now + this.cacheTtlMs;
      this.rebuildMap(normalized);
      return normalized;
    } catch (err) {
      this.logger.warn(
        "PersonaRegistry: DB unreachable, using fallback priorities",
        {
          error: err instanceof Error ? err.message : String(err),
        },
      );

      // Build Persona objects from fallback map
      const fallback = this.buildFallbackPersonas();
      this.cachedPersonas = fallback;
      // Short TTL on fallback so we retry DB sooner
      this.cacheExpiresAt = now + 30_000; // 30 seconds
      this.rebuildMap(fallback);
      return fallback;
    }
  }

  /**
   * Normalize DB persona codes from camelCase to snake_case PersonaCode.
   */
  private normalizeDbPersonas(personas: Persona[]): Persona[] {
    return personas.map((p) => {
      const normalizedCode = DB_CODE_NORMALIZATION[p.code] ?? p.code;
      // Validate that the normalized code is a valid PersonaCode
      if (!PERSONA_CODES.includes(normalizedCode as PersonaCode)) {
        this.logger.warn(
          "PersonaRegistry: Unknown persona code from DB, skipping",
          {
            code: p.code,
            normalized: normalizedCode,
          },
        );
      }
      return { ...p, code: normalizedCode as PersonaCode };
    });
  }

  /**
   * Build synthetic Persona objects from FALLBACK_PRIORITIES.
   */
  private buildFallbackPersonas(): Persona[] {
    return Array.from(FALLBACK_PRIORITIES.entries()).map(([code, fb]) => ({
      id: `fallback-${code}`,
      code,
      name: code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      scopeMode: fb.scopeMode,
      priority: fb.priority,
      isSystem: true,
    }));
  }

  /**
   * Rebuild the PersonaCode → Persona lookup map.
   */
  private rebuildMap(personas: Persona[]): void {
    this.personaMap.clear();
    for (const p of personas) {
      this.personaMap.set(p.code, p);
    }
  }

  /**
   * Normalize any role/persona code to a canonical PersonaCode.
   * Returns null if unrecognized.
   */
  private normalizeCode(code: string): PersonaCode | null {
    // 1. Direct match against canonical codes
    if (PERSONA_CODES.includes(code as PersonaCode)) {
      return code as PersonaCode;
    }
    // 2. Alias lookup (covers camelCase, legacy, synonyms)
    const alias = ROLE_ALIAS_MAP[code];
    if (alias) return alias;

    // 3. Try lowercase
    const lower = code.toLowerCase();
    if (lower !== code) {
      if (PERSONA_CODES.includes(lower as PersonaCode)) {
        return lower as PersonaCode;
      }
      const lowerAlias = ROLE_ALIAS_MAP[lower];
      if (lowerAlias) return lowerAlias;
    }

    return null;
  }
}
