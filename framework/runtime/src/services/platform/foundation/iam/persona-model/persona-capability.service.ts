/**
 * Persona Capability Service
 *
 * Evaluates persona capabilities with OU scope, ownership, and module checks.
 */

import { PERSONA_CODES } from "./types.js";

import type { PersonaRegistryService } from "./persona-registry.service.js";
import type { IPersonaCapabilityRepository } from "./persona-capability.repository.js";
import type {
  AuthorizationDecision,
  CapabilityCheckResult,
  CapabilityContext,
  CapabilityMatrix,
  CapabilityMatrixRow,
  ConstraintType,
  Persona,
  PersonaCapability,
  PersonaCode,
  SubjectWithPersona,
} from "./types.js";
import type { Logger } from "../../../../../kernel/logger.js";


// ============================================================================
// Service Interface
// ============================================================================

export interface IPersonaCapabilityService {
  /** Check if a persona has capability for an operation */
  hasCapability(
    personaCode: PersonaCode,
    operationCode: string,
    context?: CapabilityContext
  ): Promise<CapabilityCheckResult>;

  /** Get all granted capabilities for a persona */
  getPersonaCapabilities(personaCode: PersonaCode): Promise<PersonaCapability[]>;

  /** Get all personas that have a specific capability */
  getPersonasWithCapability(operationCode: string): Promise<PersonaCode[]>;

  /** Get the full capability matrix */
  getCapabilityMatrix(): Promise<CapabilityMatrix>;

  /** Get capability matrix as rows for UI display */
  getCapabilityMatrixRows(): Promise<CapabilityMatrixRow[]>;

  /** Resolve effective persona from roles */
  resolveEffectivePersona(roles: string[]): PersonaCode | Promise<PersonaCode>;

  /** Full authorization check with OU and module scope */
  authorize(
    subject: SubjectWithPersona,
    operationCode: string,
    context: CapabilityContext & { tenantId: string }
  ): Promise<AuthorizationDecision>;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class PersonaCapabilityService implements IPersonaCapabilityService {
  private capabilityCache: Map<string, PersonaCapability[]> = new Map();
  private personaCache: Map<string, Persona> = new Map();
  private cacheExpiry: number = 0;
  private cacheTtlMs: number;
  private registry: PersonaRegistryService | null;

  constructor(
    private repo: IPersonaCapabilityRepository,
    private logger: Logger,
    options?: { cacheTtlMs?: number; registry?: PersonaRegistryService }
  ) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 5 * 60 * 1000; // 5 minutes default
    this.registry = options?.registry ?? null;
  }

  /**
   * Check if a persona has capability for an operation
   */
  async hasCapability(
    personaCode: PersonaCode,
    operationCode: string,
    context?: CapabilityContext
  ): Promise<CapabilityCheckResult> {
    // Get the capability grant
    const capability = await this.repo.getCapabilityForOperation(personaCode, operationCode);

    // No capability defined or not granted
    if (!capability || !capability.isGranted) {
      return {
        allowed: false,
        persona: personaCode,
        operation: operationCode,
        reason: `Persona '${personaCode}' does not have '${operationCode}' capability`,
      };
    }

    // Check constraint type
    const constraintResult = this.evaluateConstraint(capability, context);
    if (!constraintResult.allowed) {
      return {
        allowed: false,
        persona: personaCode,
        operation: operationCode,
        constraintType: capability.constraintType,
        reason: constraintResult.reason,
        matchedCapability: capability,
      };
    }

    return {
      allowed: true,
      persona: personaCode,
      operation: operationCode,
      constraintType: capability.constraintType,
      matchedCapability: capability,
    };
  }

  /**
   * Evaluate constraint type against context
   */
  private evaluateConstraint(
    capability: PersonaCapability,
    context?: CapabilityContext
  ): { allowed: boolean; reason?: string } {
    const constraintType = capability.constraintType;

    switch (constraintType) {
      case "none":
        // No constraint, always allowed if capability is granted
        return { allowed: true };

      case "own":
        // Must be owner of the record
        if (context?.isOwner === undefined) {
          return {
            allowed: false,
            reason: "Ownership constraint requires record context",
          };
        }
        if (!context.isOwner) {
          return {
            allowed: false,
            reason: "Operation restricted to record owner",
          };
        }
        return { allowed: true };

      case "ou":
        // Must be within OU scope
        if (!context?.subjectOuPath || !context?.recordOuPath) {
          // If no OU context, allow but log warning
          this.logger.debug("OU constraint check skipped - missing OU context", {
            capability: capability.operationCode,
          });
          return { allowed: true };
        }
        if (!this.isInOuScope(context.subjectOuPath, context.recordOuPath)) {
          return {
            allowed: false,
            reason: `Record OU '${context.recordOuPath}' not in subject OU scope '${context.subjectOuPath}'`,
          };
        }
        return { allowed: true };

      case "module":
        // Module constraint is checked separately via authorize()
        // Here we just pass through
        return { allowed: true };

      default:
        return { allowed: true };
    }
  }

  /**
   * Check if record OU is within subject's OU scope
   * Subject can access records at their OU level or below
   */
  private isInOuScope(subjectOuPath: string, recordOuPath: string): boolean {
    // Normalize paths
    const subjectPath = subjectOuPath.endsWith("/")
      ? subjectOuPath
      : `${subjectOuPath}/`;
    const recordPath = recordOuPath.endsWith("/")
      ? recordOuPath
      : `${recordOuPath}/`;

    // Record is in scope if it starts with subject's path
    // e.g., subject=/org/div1/ can access /org/div1/dept1/
    return recordPath.startsWith(subjectPath) || recordPath === subjectPath;
  }

  /**
   * Get all granted capabilities for a persona
   */
  async getPersonaCapabilities(personaCode: PersonaCode): Promise<PersonaCapability[]> {
    // Check cache
    if (this.isCacheValid()) {
      const cached = this.capabilityCache.get(personaCode);
      if (cached) return cached;
    }

    const capabilities = await this.repo.getCapabilitiesForPersona(personaCode);

    // Cache
    this.capabilityCache.set(personaCode, capabilities);
    this.updateCacheExpiry();

    return capabilities;
  }

  /**
   * Get all personas that have a specific capability
   */
  async getPersonasWithCapability(operationCode: string): Promise<PersonaCode[]> {
    const personas: PersonaCode[] = [];

    for (const personaCode of PERSONA_CODES) {
      const capability = await this.repo.getCapabilityForOperation(
        personaCode,
        operationCode
      );
      if (capability?.isGranted) {
        personas.push(personaCode);
      }
    }

    return personas;
  }

  /**
   * Get the full capability matrix
   */
  async getCapabilityMatrix(): Promise<CapabilityMatrix> {
    return this.repo.getCapabilityMatrix();
  }

  /**
   * Get capability matrix as rows for UI display
   */
  async getCapabilityMatrixRows(): Promise<CapabilityMatrixRow[]> {
    const matrix = await this.getCapabilityMatrix();
    const rows: CapabilityMatrixRow[] = [];

    for (const operation of matrix.operations) {
      const grants: Record<
        PersonaCode,
        { isGranted: boolean; constraintType: ConstraintType }
      > = {} as any;

      for (const persona of matrix.personas) {
        const capability = matrix.capabilities.find(
          (c) =>
            c.personaCode === persona.code && c.operationCode === operation.code
        );

        grants[persona.code] = {
          isGranted: capability?.isGranted ?? false,
          constraintType: capability?.constraintType ?? "none",
        };
      }

      rows.push({
        category: operation.categoryCode,
        operation,
        grants,
      });
    }

    return rows;
  }

  /**
   * Resolve effective persona from roles.
   * Delegates to PersonaRegistryService (DB-driven priorities) when available,
   * falls back to hardcoded priority order for backwards compatibility.
   */
  resolveEffectivePersona(roles: string[]): PersonaCode | Promise<PersonaCode> {
    if (this.registry) {
      return this.registry.resolveEffectivePersona(roles);
    }
    return this.resolveEffectivePersonaSync(roles);
  }

  /**
   * Legacy synchronous resolution (hardcoded fallback).
   * @deprecated Use PersonaRegistryService for DB-driven priority.
   */
  private resolveEffectivePersonaSync(roles: string[]): PersonaCode {
    const normalizedRoles = roles.map((r) => r.toLowerCase());

    const priorityOrder: PersonaCode[] = [
      "tenant_admin",
      "module_admin",
      "manager",
      "agent",
      "requester",
      "reporter",
      "viewer",
    ];

    for (const persona of priorityOrder) {
      if (normalizedRoles.includes(persona)) {
        return persona;
      }
    }

    const roleMapping: Record<string, PersonaCode> = {
      admin: "tenant_admin",
      administrator: "tenant_admin",
      tenantadmin: "tenant_admin",
      moduleadmin: "module_admin",
      supervisor: "manager",
      processor: "agent",
      user: "requester",
      analyst: "reporter",
      readonly: "viewer",
      guest: "viewer",
    };

    for (const role of normalizedRoles) {
      if (roleMapping[role]) {
        return roleMapping[role];
      }
    }

    return "viewer";
  }

  /**
   * Full authorization check with OU and module scope
   */
  async authorize(
    subject: SubjectWithPersona,
    operationCode: string,
    context: CapabilityContext & { tenantId: string }
  ): Promise<AuthorizationDecision> {
    const persona = subject.effectivePersona;

    // 1. Check persona capability
    const capabilityResult = await this.hasCapability(persona, operationCode, {
      ...context,
      subjectOuPath: subject.ouMembership?.path,
    });

    if (!capabilityResult.allowed) {
      return {
        allowed: false,
        reason: capabilityResult.reason ?? "Capability check failed",
        capability: capabilityResult,
      };
    }

    // 2. Check module subscription if constraint is 'module'
    if (capabilityResult.constraintType === "module") {
      const moduleCode = context.moduleCode ?? await this.resolveModuleCode(context.entityKey);

      if (moduleCode) {
        const hasSubscription = await this.repo.hasModuleSubscription(
          context.tenantId,
          moduleCode
        );

        if (!hasSubscription) {
          return {
            allowed: false,
            reason: `Tenant does not have subscription to module '${moduleCode}'`,
            capability: capabilityResult,
            moduleSubscriptionChecked: true,
          };
        }
      }
    }

    // 3. All checks passed
    return {
      allowed: true,
      reason: "Authorized",
      capability: capabilityResult,
      ouScopeChecked: capabilityResult.constraintType === "ou",
      moduleSubscriptionChecked: capabilityResult.constraintType === "module",
    };
  }

  /**
   * Resolve module code from entity key
   */
  private async resolveModuleCode(entityKey?: string): Promise<string | undefined> {
    if (!entityKey) return undefined;

    const mapping = await this.repo.getEntityModuleMapping(entityKey);
    return mapping?.moduleCode;
  }

  // --------------------------------------------------------------------------
  // Cache Management
  // --------------------------------------------------------------------------

  private isCacheValid(): boolean {
    return Date.now() < this.cacheExpiry;
  }

  private updateCacheExpiry(): void {
    this.cacheExpiry = Date.now() + this.cacheTtlMs;
  }

  /**
   * Clear the capability cache
   */
  clearCache(): void {
    this.capabilityCache.clear();
    this.personaCache.clear();
    this.cacheExpiry = 0;
  }
}
