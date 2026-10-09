import {
  parseEntitySuccessorTargetPin,
  type EntitySuccessorTargetPin,
} from "./entity-successor-policy.js";
import { createHash } from "node:crypto";
import {
  assertLocalDevelopmentAuthority,
  type LocalDevelopmentAuthority,
  type LocalPublicationAdmission,
} from "./local-development-authority.js";

/** Server-resolved inputs. The dispatcher re-resolves these before execution.
 * Storage and signature adapters still verify their own resource semantics. */
export interface LocalPublicationInputs {
  readonly changeSetId: string;
  readonly revision: number;
  readonly sourceHash: string;
  readonly compilerHash: string;
  /** Older preparation-only requests omit this. Release execution requires it. */
  readonly release?: {
    readonly descriptorHash: string;
    readonly predecessorReleaseId: string | null;
  };
  readonly resourceHashes: readonly string[];
  readonly targets: readonly {
    readonly plane: "studio" | "neon" | "mesh";
    readonly instance: string;
    readonly predecessorHash: string | null;
    readonly predecessor?: EntitySuccessorTargetPin;
    readonly artifactHash: string;
  }[];
}
export interface LocalPublicationRequest {
  readonly schema: "athyper.local-publication-request/1";
  readonly basis: "local_development_authority";
  readonly authority: {
    readonly id: string;
    readonly version: number;
    readonly hash: string;
  };
  readonly admission: LocalPublicationAdmission;
  readonly inputs: LocalPublicationInputs;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly hash: string;
}
const hashPattern = /^[a-f0-9]{64}$/;
function required(value: unknown, code: string): asserts value {
  if (!value) throw Error(`LOCAL_PUBLICATION_REQUEST_${code}`);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  const result = JSON.stringify(value);
  required(result !== undefined, "VALUE_INVALID");
  return result;
}
function inputs(value: LocalPublicationInputs): LocalPublicationInputs {
  required(
    value.changeSetId.trim() &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0 &&
      hashPattern.test(value.sourceHash) &&
      hashPattern.test(value.compilerHash),
    "SOURCE_INVALID",
  );
  required(
    value.resourceHashes.every((h) => hashPattern.test(h)) &&
      new Set(value.resourceHashes).size === value.resourceHashes.length,
    "RESOURCES_INVALID",
  );
  required(
    value.targets.length > 0 &&
      new Set(value.targets.map((t) => t.plane)).size ===
        value.targets.length &&
      value.targets.every(
        (t) =>
          ["studio", "neon", "mesh"].includes(t.plane) &&
          t.instance === "dev" &&
          hashPattern.test(t.artifactHash) &&
          (!t.predecessor ||
            (t.predecessor.plane === t.plane &&
              t.predecessor.instance === t.instance &&
              (t.predecessor.artifactHash ?? null) === t.predecessorHash &&
              t.predecessor.sourceReleaseId ===
                value.release?.predecessorReleaseId)) &&
          (t.predecessorHash === null || hashPattern.test(t.predecessorHash)),
      ),
    "TARGETS_INVALID",
  );
  if (value.release !== undefined)
    required(
      value.release !== null &&
        Object.keys(value.release).sort().join() ===
          "descriptorHash,predecessorReleaseId" &&
        hashPattern.test(value.release.descriptorHash) &&
        (value.release.predecessorReleaseId === null ||
          /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
            value.release.predecessorReleaseId,
          )),
      "RELEASE_INVALID",
    );
  return {
    ...(value.release ? { release: { ...value.release } } : {}),
    changeSetId: value.changeSetId,
    revision: value.revision,
    sourceHash: value.sourceHash,
    compilerHash: value.compilerHash,
    resourceHashes: [...value.resourceHashes].sort(),
    targets: value.targets
      .map((t) => ({
        plane: t.plane,
        instance: t.instance,
        predecessorHash: t.predecessorHash,
        artifactHash: t.artifactHash,
        ...(t.predecessor
          ? { predecessor: parseEntitySuccessorTargetPin(t.predecessor) }
          : {}),
      }))
      .sort((a, b) => a.plane.localeCompare(b.plane)),
  };
}
function body(
  authority: LocalDevelopmentAuthority,
  admission: LocalPublicationAdmission,
  source: LocalPublicationInputs,
  issuedAt: string,
  expiresAt: string,
) {
  const resolved = inputs(source);
  required(
    canonical(
      [...admission.targets].sort((a, b) => a.plane.localeCompare(b.plane)),
    ) ===
      canonical(
        resolved.targets.map((t) => ({ plane: t.plane, instance: t.instance })),
      ),
    "ADMISSION_TARGET_MISMATCH",
  );
  return {
    schema: "athyper.local-publication-request/1" as const,
    basis: "local_development_authority" as const,
    authority: {
      id: authority.id,
      version: authority.version,
      hash: authority.hash,
    },
    admission: structuredClone(admission),
    inputs: resolved,
    issuedAt,
    expiresAt,
  };
}
/** Renewal uses this same operation with newly resolved inputs and current
 * authorization. It never mutates the prior exact request or approval evidence. */
export function createLocalPublicationRequest(
  authority: LocalDevelopmentAuthority,
  admission: LocalPublicationAdmission,
  source: LocalPublicationInputs,
  now = Date.now(),
  lifetimeMs = 15 * 60_000,
): LocalPublicationRequest {
  assertLocalDevelopmentAuthority(authority, admission, now);
  required(
    Number.isSafeInteger(lifetimeMs) &&
      lifetimeMs > 0 &&
      lifetimeMs <= 24 * 60 * 60_000,
    "LIFETIME_INVALID",
  );
  const value = body(
    authority,
    admission,
    source,
    new Date(now).toISOString(),
    new Date(
      Math.min(now + lifetimeMs, Date.parse(authority.expiresAt)),
    ).toISOString(),
  );
  return {
    ...value,
    hash: createHash("sha256").update(canonical(value)).digest("hex"),
  };
}
export function assertLocalPublicationRequest(
  request: LocalPublicationRequest,
  authority: LocalDevelopmentAuthority,
  admission: LocalPublicationAdmission,
  current: LocalPublicationInputs,
  now = Date.now(),
): void {
  assertLocalDevelopmentAuthority(authority, admission, now);
  const issued = Date.parse(request.issuedAt),
    expires = Date.parse(request.expiresAt);
  required(
    Number.isFinite(issued) &&
      Number.isFinite(expires) &&
      issued <= now &&
      now < expires &&
      expires - issued <= 24 * 60 * 60_000 &&
      expires <= Date.parse(authority.expiresAt),
    "EXPIRED",
  );
  const expected = body(
    authority,
    admission,
    current,
    request.issuedAt,
    request.expiresAt,
  );
  const { hash, ...actual } = request;
  required(
    canonical(expected) === canonical(actual) &&
      hashPattern.test(hash) &&
      createHash("sha256").update(canonical(expected)).digest("hex") === hash,
    "INPUT_CHANGED",
  );
}
