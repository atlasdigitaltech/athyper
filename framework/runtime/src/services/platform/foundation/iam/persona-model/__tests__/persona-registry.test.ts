/**
 * PersonaRegistryService Tests
 *
 * Validates DB-driven priority resolution, cache behavior,
 * role normalization, and graceful fallback.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import { InMemoryPersonaCapabilityRepository } from "../persona-capability.repository.js";
import { PersonaRegistryService } from "../persona-registry.service.js";
import type { Persona, PersonaCode, ScopeMode } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  log: vi.fn(),
} as any;

/** Build a Persona object for testing. */
function makePersona(
  code: string,
  priority: number,
  scopeMode: ScopeMode = "tenant",
  isSystem = true,
): Persona {
  return {
    id: `id-${code}`,
    code: code as PersonaCode,
    name: code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    scopeMode,
    priority,
    isSystem,
  };
}

/** Standard DB seed personas (using DB codes). */
const DB_PERSONAS: Persona[] = [
  makePersona("viewer",      10, "tenant"),
  makePersona("reporter",    20, "tenant"),
  makePersona("requester",   30, "tenant"),
  makePersona("agent",       40, "ou"),
  makePersona("manager",     50, "ou"),
  makePersona("moduleAdmin", 60, "module"),  // camelCase from DB
  makePersona("tenantAdmin", 100, "tenant"), // camelCase from DB
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PersonaRegistryService", () => {
  let repo: InMemoryPersonaCapabilityRepository;
  let registry: PersonaRegistryService;

  beforeEach(() => {
    repo = new InMemoryPersonaCapabilityRepository();
    repo.setPersonas(DB_PERSONAS);
    registry = new PersonaRegistryService(repo, noopLogger, { cacheTtlMs: 100 });
  });

  // ── getPersonas ─────────────────────────────────────────────────────

  describe("getPersonas", () => {
    it("loads and normalizes persona codes from DB", async () => {
      const personas = await registry.getPersonas();
      const codes = personas.map((p) => p.code);

      expect(codes).toContain("module_admin");
      expect(codes).toContain("tenant_admin");
      expect(codes).not.toContain("moduleAdmin");
      expect(codes).not.toContain("tenantAdmin");
    });

    it("preserves all 7 personas", async () => {
      const personas = await registry.getPersonas();
      expect(personas).toHaveLength(7);
    });
  });

  // ── getPersona ──────────────────────────────────────────────────────

  describe("getPersona", () => {
    it("resolves canonical snake_case code", async () => {
      const p = await registry.getPersona("tenant_admin");
      expect(p).not.toBeNull();
      expect(p!.code).toBe("tenant_admin");
      expect(p!.priority).toBe(100);
    });

    it("resolves camelCase DB code", async () => {
      const p = await registry.getPersona("tenantAdmin");
      expect(p).not.toBeNull();
      expect(p!.code).toBe("tenant_admin");
    });

    it("resolves simple codes directly", async () => {
      const p = await registry.getPersona("viewer");
      expect(p).not.toBeNull();
      expect(p!.priority).toBe(10);
    });

    it("returns null for unknown code", async () => {
      const p = await registry.getPersona("unknown_role");
      expect(p).toBeNull();
    });
  });

  // ── getScopeMode ────────────────────────────────────────────────────

  describe("getScopeMode", () => {
    it("returns correct scope for each persona", async () => {
      expect(await registry.getScopeMode("viewer")).toBe("tenant");
      expect(await registry.getScopeMode("agent")).toBe("ou");
      expect(await registry.getScopeMode("module_admin")).toBe("module");
      expect(await registry.getScopeMode("tenant_admin")).toBe("tenant");
    });
  });

  // ── getPriority ─────────────────────────────────────────────────────

  describe("getPriority", () => {
    it("returns DB priority values", async () => {
      expect(await registry.getPriority("viewer")).toBe(10);
      expect(await registry.getPriority("tenant_admin")).toBe(100);
      expect(await registry.getPriority("manager")).toBe(50);
    });

    it("returns null for unknown code", async () => {
      expect(await registry.getPriority("nonexistent")).toBeNull();
    });
  });

  // ── resolveEffectivePersona ─────────────────────────────────────────

  describe("resolveEffectivePersona", () => {
    it("picks the most privileged persona (highest priority)", async () => {
      const result = await registry.resolveEffectivePersona([
        "viewer",
        "agent",
        "tenant_admin",
      ]);
      expect(result).toBe("tenant_admin");
    });

    it("resolves single role", async () => {
      expect(await registry.resolveEffectivePersona(["requester"])).toBe("requester");
    });

    it("defaults to viewer when no roles match", async () => {
      expect(await registry.resolveEffectivePersona([])).toBe("viewer");
      expect(await registry.resolveEffectivePersona(["unknown_xyz"])).toBe("viewer");
    });

    it("handles case-insensitive matching", async () => {
      expect(await registry.resolveEffectivePersona(["TENANT_ADMIN"])).toBe("tenant_admin");
      expect(await registry.resolveEffectivePersona(["Manager"])).toBe("manager");
    });

    it("handles alias roles", async () => {
      expect(await registry.resolveEffectivePersona(["admin"])).toBe("tenant_admin");
      expect(await registry.resolveEffectivePersona(["supervisor"])).toBe("manager");
      expect(await registry.resolveEffectivePersona(["readonly"])).toBe("viewer");
      expect(await registry.resolveEffectivePersona(["user"])).toBe("requester");
    });

    it("handles camelCase DB role codes", async () => {
      expect(await registry.resolveEffectivePersona(["tenantAdmin"])).toBe("tenant_admin");
      expect(await registry.resolveEffectivePersona(["moduleAdmin"])).toBe("module_admin");
    });

    it("picks best from mixed canonical and alias roles", async () => {
      const result = await registry.resolveEffectivePersona([
        "readonly",   // alias for viewer (10)
        "processor",  // alias for agent (40)
        "manager",    // canonical (50)
      ]);
      expect(result).toBe("manager");
    });

    it("picks module_admin over manager", async () => {
      const result = await registry.resolveEffectivePersona([
        "manager",
        "module_admin",
      ]);
      expect(result).toBe("module_admin");
    });
  });

  // ── getQualifiedPersonas ────────────────────────────────────────────

  describe("getQualifiedPersonas", () => {
    it("returns all matching personas sorted by priority (most privileged first)", async () => {
      const result = await registry.getQualifiedPersonas([
        "viewer",
        "agent",
        "tenant_admin",
      ]);
      expect(result).toEqual(["tenant_admin", "agent", "viewer"]);
    });

    it("deduplicates alias matches", async () => {
      const result = await registry.getQualifiedPersonas([
        "admin",        // alias for tenant_admin
        "tenant_admin", // canonical
      ]);
      expect(result).toEqual(["tenant_admin"]);
    });

    it("returns empty array for no matches", async () => {
      const result = await registry.getQualifiedPersonas(["unknown_role"]);
      expect(result).toEqual([]);
    });
  });

  // ── Cache behavior ──────────────────────────────────────────────────

  describe("cache behavior", () => {
    it("uses cache on subsequent calls", async () => {
      const getPersonasSpy = vi.spyOn(repo, "getPersonas");

      await registry.resolveEffectivePersona(["viewer"]);
      await registry.resolveEffectivePersona(["agent"]);

      // Second call should use cache (only 1 DB call)
      expect(getPersonasSpy).toHaveBeenCalledTimes(1);
    });

    it("refreshes cache after TTL expires", async () => {
      // Use a very short TTL so the test doesn't sleep long
      const shortTtlRegistry = new PersonaRegistryService(repo, noopLogger, { cacheTtlMs: 50 });
      const getPersonasSpy = vi.spyOn(repo, "getPersonas");

      await shortTtlRegistry.resolveEffectivePersona(["viewer"]);
      expect(getPersonasSpy).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 60));

      await shortTtlRegistry.resolveEffectivePersona(["viewer"]);
      expect(getPersonasSpy).toHaveBeenCalledTimes(2);
    });

    it("invalidateCache() forces reload", async () => {
      const getPersonasSpy = vi.spyOn(repo, "getPersonas");

      await registry.getPersonas();
      expect(getPersonasSpy).toHaveBeenCalledTimes(1);

      registry.invalidateCache();
      await registry.getPersonas();
      expect(getPersonasSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── Fallback behavior ───────────────────────────────────────────────

  describe("fallback when DB unreachable", () => {
    it("uses hardcoded fallback priorities on DB error", async () => {
      const failingRepo = new InMemoryPersonaCapabilityRepository();
      // Override getPersonas to throw
      failingRepo.getPersonas = async () => {
        throw new Error("DB connection refused");
      };

      const fallbackRegistry = new PersonaRegistryService(failingRepo, noopLogger);

      const result = await fallbackRegistry.resolveEffectivePersona([
        "viewer",
        "tenant_admin",
      ]);
      expect(result).toBe("tenant_admin");
      expect(noopLogger.warn).toHaveBeenCalled();
    });

    it("fallback personas have correct scope modes", async () => {
      const failingRepo = new InMemoryPersonaCapabilityRepository();
      failingRepo.getPersonas = async () => {
        throw new Error("DB down");
      };

      const fallbackRegistry = new PersonaRegistryService(failingRepo, noopLogger);

      expect(await fallbackRegistry.getScopeMode("agent")).toBe("ou");
      expect(await fallbackRegistry.getScopeMode("module_admin")).toBe("module");
      expect(await fallbackRegistry.getScopeMode("tenant_admin")).toBe("tenant");
    });
  });
});
