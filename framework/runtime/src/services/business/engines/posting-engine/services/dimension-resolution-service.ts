// framework/runtime/src/services/business/engines/posting-engine/services/dimension-resolution-service.ts
//
// Resolves raw dimension inputs into canonical dimension_set_ids.
// Evaluates dimension policies, applies OU defaults, and calls
// fin.resolve_dimension_set() for hash-normalized set creation.

import type {
  DimensionPair,
  DimensionPolicyBehavior,
  DimensionResolutionEntry,
  DimensionResolutionMeta,
  DimensionResolutionSource,
  LineDimensionInput,
} from "../domain/types";
import type { TransactionContext } from "./posting-service";

// ---------------------------------------------------------------------------
// Repository interface — implemented by the DB adapter layer
// ---------------------------------------------------------------------------

export interface DimensionRepo {
  /** Look up a dimension type by code within a tenant+entity */
  getTypeByCode(
    tenantId: string,
    entityCode: string,
    code: string,
  ): Promise<{ id: string; code: string; sourceKind: string } | null>;

  /** Look up a dimension value by type+code within a tenant+entity */
  getValueByCode(
    tenantId: string,
    entityCode: string,
    typeId: string,
    code: string,
  ): Promise<{ id: string; code: string; status: string; allowPosting: boolean } | null>;

  /** Get OU dimension defaults for a given OU */
  getOuDefaults(
    tenantId: string,
    entityCode: string,
    ouId: string,
  ): Promise<Array<{ dimensionTypeId: string; dimensionValueId: string }>>;

  /** Evaluate matching dimension policies for a posting context.
   *  Returns policies sorted by specificity (most specific first). */
  evaluatePolicies(
    tenantId: string,
    entityCode: string,
    context: {
      accountCode?: string;
      accountType?: string;
      subledgerType?: string;
      docType?: string;
      intentCode?: string;
      ouId?: string;
      domain?: string;
      bookCode?: string;
    },
  ): Promise<
    Array<{
      dimensionTypeId: string;
      dimensionTypeCode: string;
      behavior: string;
      fixedValueId: string | null;
      deriveSource: string | null;
      policyCode: string;
      policyVersion: number;
    }>
  >;

  /**
   * Call fin.resolve_dimension_set() — hash-normalize pairs and return set_id.
   * Creates a new set atomically if no matching hash exists.
   */
  resolveDimensionSet(
    tenantId: string,
    entityCode: string,
    pairs: DimensionPair[],
    tx?: TransactionContext,
  ): Promise<string | null>;

  /**
   * Persist dimension resolution metadata — structural audit trail.
   * Called after successful resolution to create an immutable record.
   */
  persistResolutionMeta(
    meta: {
      tenantId: string;
      entityCode: string;
      targetKind: "journal_line" | "document_line" | "transaction_pipeline";
      targetId: string;
      dimensionSetId: string | null;
      resolutionLog: DimensionResolutionEntry[];
      resolutionHash: string;
      evaluatedPolicies: Array<{
        policyId: string;
        policyCode: string;
        policyVersion: number;
        behavior: string;
        matched: boolean;
      }>;
      resolvedBy: string | null;
    },
    tx?: TransactionContext,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface DimensionResolutionResult {
  /** The resolved canonical dimension set ID (NULL = undimensioned) */
  dimensionSetId: string | null;
  /** Audit log of how each dimension was resolved */
  derivationLog: DimensionResolutionEntry[];
  /** Validation errors (non-empty = resolution failed) */
  errors: string[];
  /** SHA-256 hash of derivation log for tamper detection */
  resolutionHash: string | null;
  /** Snapshot of all evaluated policies with version + match status */
  evaluatedPolicies: Array<{
    policyId: string;
    policyCode: string;
    policyVersion: number;
    behavior: string;
    matched: boolean;
  }>;
}

export interface DimensionResolutionService {
  /**
   * Resolve dimensions for a single journal line.
   *
   * Resolution order:
   *   1. If caller provides a pre-resolved dimensionSetId, use it directly
   *   2. Otherwise, evaluate dimension input:
   *      a. Start with user-provided dimensions
   *      b. Apply policies (FIXED_VALUE, DERIVE_IF_MISSING, INHERIT_FROM_HEADER)
   *      c. Fill gaps from OU defaults
   *      d. Validate REQUIRED dimensions are present
   *      e. Reject FORBIDDEN dimensions
   *      f. Call fin.resolve_dimension_set() for hash normalization
   */
  resolveForLine(
    tenantId: string,
    entityCode: string,
    input: LineDimensionInput,
    tx?: TransactionContext,
  ): Promise<DimensionResolutionResult>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultDimensionResolutionService
  implements DimensionResolutionService
{
  constructor(private readonly dimRepo: DimensionRepo) {}

  async resolveForLine(
    tenantId: string,
    entityCode: string,
    input: LineDimensionInput,
    tx?: TransactionContext,
  ): Promise<DimensionResolutionResult> {
    const derivationLog: DimensionResolutionEntry[] = [];
    const errors: string[] = [];

    // Resolved pairs: typeId → valueId
    const resolved = new Map<string, { valueId: string; typeCode: string; valueCode: string; source: DimensionResolutionSource }>();

    // ── Step 1: User-provided dimensions ─────────────────────────
    if (input.dimensions) {
      for (const dim of input.dimensions) {
        const dimType = await this.dimRepo.getTypeByCode(
          tenantId,
          entityCode,
          dim.typeCode,
        );
        if (!dimType) {
          errors.push(`Unknown dimension type: ${dim.typeCode}`);
          continue;
        }

        const dimValue = await this.dimRepo.getValueByCode(
          tenantId,
          entityCode,
          dimType.id,
          dim.valueCode,
        );
        if (!dimValue) {
          errors.push(
            `Unknown dimension value: ${dim.valueCode} for type ${dim.typeCode}`,
          );
          continue;
        }
        if (!dimValue.allowPosting || dimValue.status !== "ACTIVE") {
          errors.push(
            `Dimension value ${dim.valueCode} (${dim.typeCode}) is not available for posting (status: ${dimValue.status})`,
          );
          continue;
        }

        resolved.set(dimType.id, {
          valueId: dimValue.id,
          typeCode: dim.typeCode,
          valueCode: dim.valueCode,
          source: "USER",
        });
      }
    }

    if (errors.length > 0) {
      return { dimensionSetId: null, derivationLog, errors, resolutionHash: null, evaluatedPolicies: [] };
    }

    // ── Step 2: Evaluate policies ────────────────────────────────
    const policies = await this.dimRepo.evaluatePolicies(
      tenantId,
      entityCode,
      {
        accountCode: input.accountCode,
        accountType: input.accountType ?? undefined,
        subledgerType: input.subledgerType ?? undefined,
        docType: input.docType,
        intentCode: input.intentCode,
        ouId: input.ouId,
        domain: input.domain,
        bookCode: input.bookCode,
      },
    );

    // Build policy snapshot for auditability (freeze evaluated context)
    const evaluatedPolicies = policies.map((p) => ({
      policyId: p.dimensionTypeId, // Use as correlation key
      policyCode: p.policyCode,
      policyVersion: p.policyVersion,
      behavior: p.behavior,
      matched: false, // Will be set to true if policy actually triggered
    }));

    for (let pi = 0; pi < policies.length; pi++) {
      const policy = policies[pi];
      const alreadyResolved = resolved.has(policy.dimensionTypeId);

      switch (policy.behavior) {
        case "FORBIDDEN":
          if (alreadyResolved) {
            errors.push(
              `Dimension ${policy.dimensionTypeCode} is FORBIDDEN by policy ${policy.policyCode}`,
            );
            evaluatedPolicies[pi].matched = true;
          }
          break;

        case "REQUIRED":
          // Will be validated after OU defaults fill
          evaluatedPolicies[pi].matched = true;
          break;

        case "FIXED_VALUE":
          if (policy.fixedValueId) {
            resolved.set(policy.dimensionTypeId, {
              valueId: policy.fixedValueId,
              typeCode: policy.dimensionTypeCode,
              valueCode: "(fixed)",
              source: "FIXED_POLICY",
            });
            evaluatedPolicies[pi].matched = true;
          }
          break;

        case "DERIVE_IF_MISSING":
          if (!alreadyResolved && policy.deriveSource === "ou_default" && input.ouId) {
            // Will be handled in OU defaults step; mark as matched
            evaluatedPolicies[pi].matched = true;
          }
          break;

        case "INHERIT_FROM_HEADER":
          // Header inheritance handled at document level before posting
          evaluatedPolicies[pi].matched = true;
          break;

        case "OPTIONAL":
          // No action needed
          break;
      }
    }

    if (errors.length > 0) {
      return { dimensionSetId: null, derivationLog, errors, resolutionHash: null, evaluatedPolicies };
    }

    // ── Step 3: Fill from OU defaults ────────────────────────────
    if (input.ouId) {
      const ouDefaults = await this.dimRepo.getOuDefaults(
        tenantId,
        entityCode,
        input.ouId,
      );

      for (const def of ouDefaults) {
        if (!resolved.has(def.dimensionTypeId)) {
          resolved.set(def.dimensionTypeId, {
            valueId: def.dimensionValueId,
            typeCode: "(ou-default)",
            valueCode: "(ou-default)",
            source: "OU_DEFAULT",
          });
        }
      }
    }

    // ── Step 4: Validate REQUIRED dimensions ─────────────────────
    for (const policy of policies) {
      if (policy.behavior === "REQUIRED" && !resolved.has(policy.dimensionTypeId)) {
        errors.push(
          `Dimension ${policy.dimensionTypeCode} is REQUIRED by policy ${policy.policyCode} but was not provided`,
        );
      }
    }

    if (errors.length > 0) {
      return { dimensionSetId: null, derivationLog, errors, resolutionHash: null, evaluatedPolicies };
    }

    // ── Step 5: Build derivation log ─────────────────────────────
    for (const [typeId, entry] of resolved) {
      const matchingPolicy = policies.find(
        (p) => p.dimensionTypeId === typeId,
      );
      derivationLog.push({
        dimensionTypeCode: entry.typeCode,
        dimensionValueCode: entry.valueCode,
        dimensionTypeId: typeId,
        dimensionValueId: entry.valueId,
        source: entry.source,
        policyCode: matchingPolicy?.policyCode ?? null,
        policyVersion: matchingPolicy?.policyVersion ?? null,
        confidence: 1.0,
        warnings: [],
      });
    }

    // ── Step 6: Resolve dimension set (hash normalization) ───────
    if (resolved.size === 0) {
      return { dimensionSetId: null, derivationLog, errors, resolutionHash: null, evaluatedPolicies };
    }

    // Sort pairs by typeId for canonical hash
    const pairs: DimensionPair[] = Array.from(resolved.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([typeId, entry]) => ({ typeId, valueId: entry.valueId }));

    const dimensionSetId = await this.dimRepo.resolveDimensionSet(
      tenantId,
      entityCode,
      pairs,
      tx,
    );

    // ── Step 7: Compute resolution hash for tamper detection ─────
    const logText = JSON.stringify(derivationLog);
    const resolutionHash = await computeSha256(logText);

    return { dimensionSetId, derivationLog, errors, resolutionHash, evaluatedPolicies };
  }
}

// ---------------------------------------------------------------------------
// SHA-256 helper — works in both Node.js and edge runtimes
// ---------------------------------------------------------------------------

async function computeSha256(text: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    // Web Crypto (edge runtimes, modern Node.js)
    const data = new TextEncoder().encode(text);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Node.js fallback
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text).digest("hex");
}
