import { createHash, randomUUID } from "node:crypto";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import {
  entityCapabilityRequirements,
  parseEntityDeploymentSupportPointer,
  type EntityCapabilityRequirement,
  type EntityDeploymentSupportPointer,
  type EntityRuntimeDescriptor,
  type EntityServingTarget,
} from "@athyper/server-contract-metadata";
import { ImmutableEntitySupportReceiptStore } from "./entity-deployment-support.js";

export interface EntityQualificationBinding {
  readonly valid: boolean;
  readonly unavailableManifests: readonly string[];
  readonly target: EntityServingTarget;
  readonly adapterVersions: Readonly<Record<string, string>>;
}

/** Registered deployment authority owns authentication, retention and atomic
 * pointer replacement. An ordinary artifact writer is not this authority. */
export interface EntityQualificationAuthority<Subject> {
  authorize(subject: Subject, target: EntityServingTarget): Promise<boolean>;
  actor(subject: Subject): string;
  current(
    target: EntityServingTarget,
  ): Promise<EntityDeploymentSupportPointer | null>;
  compareAndSwap(input: {
    readonly subject: Subject;
    readonly expected: EntityDeploymentSupportPointer | null;
    readonly next: EntityDeploymentSupportPointer;
  }): Promise<boolean>;
}

export interface EntityQualificationProbe<Subject> {
  /** Case names belong to the installed registration, never the request. */
  readonly cases: readonly string[];
  execute(input: {
    readonly subject: Subject;
    readonly descriptor: EntityRuntimeDescriptor;
    readonly binding: EntityQualificationBinding;
    readonly requirement: EntityCapabilityRequirement;
    readonly signal: AbortSignal;
  }): Promise<
    readonly {
      readonly case: string;
      readonly passed: boolean;
      /** Hash of retained execution evidence, not a declaration or test name. */
      readonly evidenceHash: string;
    }[]
  >;
}

/** Stored by the registered probe after actual owner execution. It contains
 * coordinates and verdicts; record values and credentials stay out of custody. */
export interface EntityQualificationProbeEvidence {
  readonly schema: "entity-capability-probe-evidence/1";
  readonly target: EntityServingTarget;
  readonly adapterVersions: Readonly<Record<string, string>>;
  readonly capability: Omit<EntityCapabilityRequirement, "required">;
  readonly case: string;
  readonly passed: boolean;
  readonly executionId: string;
  readonly actor: string;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
}

export function entityQualificationProbeEvidenceKey(
  evidenceHash: string,
): string {
  if (!/^[a-f0-9]{64}$/.test(evidenceHash))
    throw Error("ENTITY_QUALIFICATION_EVIDENCE_HASH_INVALID");
  return `entity-framework/deployment-support/v1/probe-evidence/${evidenceHash}.json`;
}

function canonical(value: unknown): string {
  const ordered = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(ordered)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, ordered(child)]),
          )
        : item;
  return JSON.stringify(ordered(value));
}
function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
const snapshot = <T>(value: T): T => JSON.parse(canonical(value)) as T;

/** Host/operator composition only. This writer has no HTTP endpoint and accepts
 * no request-supplied results, receipt, expiry, adapter identity or storage key.
 * Probes must execute the installed owner paths with current authorization.
 * Staging a probe never makes a serving descriptor ready. */
export function createEntitySupportQualificationWriter<Subject>(options: {
  readonly storage: Pick<ObjectStorage, "get" | "putIfAbsent">;
  readonly authority: EntityQualificationAuthority<Subject>;
  readonly readDescriptor: (
    subject: Subject,
    entityCode: string,
  ) => Promise<EntityRuntimeDescriptor>;
  readonly describe: (
    descriptor: EntityRuntimeDescriptor,
  ) => EntityQualificationBinding;
  readonly probe: (
    requirement: EntityCapabilityRequirement,
  ) => EntityQualificationProbe<Subject> | undefined;
  readonly validityMs: number;
  readonly probeTimeoutMs?: number;
  readonly now?: () => number;
}) {
  if (
    !Number.isSafeInteger(options.validityMs) ||
    options.validityMs <= 0 ||
    options.validityMs > 86_400_000
  )
    throw Error("ENTITY_QUALIFICATION_VALIDITY_INVALID");
  const receipts = new ImmutableEntitySupportReceiptStore(options.storage);
  const now = options.now ?? Date.now;
  const probeTimeoutMs = options.probeTimeoutMs ?? 60_000;
  if (
    !Number.isSafeInteger(probeTimeoutMs) ||
    probeTimeoutMs < 1 ||
    probeTimeoutMs > 60_000
  )
    throw Error("ENTITY_QUALIFICATION_TIMEOUT_INVALID");
  async function retain(key: string, value: unknown) {
    const bytes = new TextEncoder().encode(canonical(value));
    const created = await options.storage.putIfAbsent!(key, bytes, {
      contentType: "application/json",
    });
    if (
      !created &&
      hash(Array.from(await options.storage.get(key))) !==
        hash(Array.from(bytes))
    )
      throw Error("ENTITY_QUALIFICATION_EVIDENCE_CONFLICT");
  }
  return {
    async qualify(input: {
      readonly subject: Subject;
      readonly entityCode: string;
      readonly signal: AbortSignal;
    }) {
      const descriptor = snapshot(
        await options.readDescriptor(input.subject, input.entityCode),
      );
      const binding = snapshot(options.describe(descriptor));
      if (!(await options.authority.authorize(input.subject, binding.target)))
        throw Error("ENTITY_QUALIFICATION_DENIED");
      if (
        !binding.valid ||
        binding.unavailableManifests.length ||
        descriptor.entityCode !== input.entityCode ||
        binding.target.plane !== descriptor.planeKey ||
        binding.target.releaseArtifactHash !==
          descriptor.compiledHash.replace(/^sha256:/, "")
      )
        throw Error("ENTITY_QUALIFICATION_BINDING_INVALID");
      const requirements = snapshot(entityCapabilityRequirements(descriptor));
      if (
        !requirements.length ||
        new Set(requirements.map((item) => item.id)).size !==
          requirements.length
      )
        throw Error("ENTITY_QUALIFICATION_REQUIREMENTS_INVALID");
      const rawPointer = await options.authority.current(binding.target);
      const expected = rawPointer
        ? parseEntityDeploymentSupportPointer(rawPointer)
        : null;
      if (expected && hash(expected.target) !== hash(binding.target))
        throw Error("ENTITY_QUALIFICATION_AUTHORITY_TARGET_INVALID");
      const attemptId = randomUUID(),
        startedAtMs = now();
      const actor = options.authority.actor(input.subject);
      if (!actor.trim()) throw Error("ENTITY_QUALIFICATION_ACTOR_REQUIRED");
      const prefix = `entity-framework/deployment-support/v1/attempts/${attemptId}`;
      await retain(`${prefix}/started.json`, {
        schema: "entity-support-qualification-attempt/1",
        attemptId,
        actor,
        startedAtMs,
        binding,
        requirements,
      });
      const observations: {
        id: string;
        passed: boolean;
        cases: unknown;
        error?: string;
      }[] = [];
      for (const requirement of requirements) {
        let timedOut = false;
        let cases: unknown = [],
          error: string | undefined,
          passed = false;
        try {
          if (input.signal.aborted)
            throw Error("ENTITY_QUALIFICATION_INTERRUPTED");
          const probe = options.probe(requirement);
          if (
            !probe ||
            !probe.cases.length ||
            new Set(probe.cases).size !== probe.cases.length
          )
            throw Error("ENTITY_QUALIFICATION_PROBE_UNAVAILABLE");
          const requiredCases = [...probe.cases];
          const controller = new AbortController();
          const signal = AbortSignal.any([input.signal, controller.signal]);
          const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, probeTimeoutMs);
          let observed: Awaited<ReturnType<typeof probe.execute>>;
          try {
            observed = snapshot(
              await new Promise<Awaited<ReturnType<typeof probe.execute>>>(
                (resolve, reject) => {
                  const aborted = () =>
                    reject(Error("ENTITY_QUALIFICATION_PROBE_INTERRUPTED"));
                  signal.addEventListener("abort", aborted, { once: true });
                  Promise.resolve()
                    .then(() => {
                      if (signal.aborted)
                        throw Error("ENTITY_QUALIFICATION_PROBE_INTERRUPTED");
                      return probe.execute({
                        subject: input.subject,
                        signal,
                        descriptor: snapshot(descriptor),
                        binding: snapshot(binding),
                        requirement: snapshot(requirement),
                      });
                    })
                    .then(resolve, reject)
                    .finally(() =>
                      signal.removeEventListener("abort", aborted),
                    );
                },
              ),
            );
          } finally {
            clearTimeout(timer);
          }
          cases = Array.isArray(observed)
            ? observed.map((row) => ({
                case: row.case,
                passed: row.passed,
                evidenceHash: row.evidenceHash,
              }))
            : [];
          if (input.signal.aborted)
            throw Error("ENTITY_QUALIFICATION_INTERRUPTED");
          if (
            !Array.isArray(observed) ||
            observed.length !== requiredCases.length ||
            new Set(observed.map((row) => row.case)).size !==
              requiredCases.length ||
            observed.some(
              (row) =>
                !requiredCases.includes(row.case) ||
                typeof row.passed !== "boolean" ||
                !/^[a-f0-9]{64}$/.test(row.evidenceHash),
            )
          )
            throw Error("ENTITY_QUALIFICATION_CASES_INCOMPLETE");
          for (const row of observed) {
            const bytes = await options.storage.get(
              entityQualificationProbeEvidenceKey(row.evidenceHash),
            );
            if (
              bytes.byteLength > 65_536 ||
              createHash("sha256").update(bytes).digest("hex") !==
                row.evidenceHash
            )
              throw Error("ENTITY_QUALIFICATION_EVIDENCE_CHANGED");
            const proof: EntityQualificationProbeEvidence = JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            );
            const { required: _required, ...capability } = requirement;
            if (
              proof.schema !== "entity-capability-probe-evidence/1" ||
              proof.case !== row.case ||
              proof.passed !== row.passed ||
              hash(proof.target) !== hash(binding.target) ||
              hash(proof.adapterVersions) !== hash(binding.adapterVersions) ||
              hash(proof.capability) !== hash(capability) ||
              proof.actor !== actor ||
              typeof proof.executionId !== "string" ||
              !proof.executionId.trim() ||
              !Number.isSafeInteger(proof.startedAtMs) ||
              !Number.isSafeInteger(proof.finishedAtMs) ||
              proof.startedAtMs < startedAtMs ||
              proof.finishedAtMs < proof.startedAtMs ||
              proof.finishedAtMs > now()
            )
              throw Error("ENTITY_QUALIFICATION_EVIDENCE_INVALID");
          }
          passed = observed.every((row) => row.passed);
        } catch {
          // Probe/driver errors may contain credentials or record values.
          error = input.signal.aborted
            ? "interrupted"
            : timedOut
              ? "timed_out"
              : "probe_failed";
        }
        observations.push({
          id: requirement.id,
          passed,
          cases,
          ...(error ? { error } : {}),
        });
      }
      let unchanged = false,
        authorized = false;
      try {
        const currentDescriptor = snapshot(
          await options.readDescriptor(input.subject, input.entityCode),
        );
        unchanged =
          hash(currentDescriptor) === hash(descriptor) &&
          hash(options.describe(currentDescriptor)) === hash(binding);
        authorized = await options.authority.authorize(
          input.subject,
          binding.target,
        );
      } catch {
        /* Failed revalidation retains evidence but never publishes. */
      }
      const finishedAtMs = now();
      const passed =
        unchanged &&
        authorized &&
        !input.signal.aborted &&
        finishedAtMs >= startedAtMs &&
        observations.every((row) => row.passed);
      const evidence = {
        schema: "entity-support-qualification-result/1",
        attemptId,
        actor,
        startedAtMs,
        finishedAtMs,
        binding,
        observations,
        unchanged,
        authorized,
        interrupted: input.signal.aborted,
        passed,
      };
      const evidenceHash = hash(evidence);
      await retain(`${prefix}/result.json`, evidence);
      await retain(
        `entity-framework/deployment-support/v1/evidence/${evidenceHash}.json`,
        evidence,
      );
      // Failed and interrupted probes also retain a receipt; their results cannot
      // qualify any capability or replace current support.
      const receiptHash = await receipts.put({
        schema: "entity-deployment-support/1",
        target: binding.target,
        adapterVersions: binding.adapterVersions,
        supportRevision: evidenceHash,
        qualifiedAtMs: finishedAtMs,
        expiresAtMs: finishedAtMs + options.validityMs,
        results: requirements.map(
          ({
            id,
            version,
            manifestHash,
            inputSchemaHash,
            resultSchemaHash,
          }) => ({
            id,
            version,
            manifestHash,
            inputSchemaHash,
            resultSchemaHash,
            passed: passed && observations.find((row) => row.id === id)!.passed,
          }),
        ),
      });
      let published = false;
      let publicationError: string | undefined;
      if (passed) {
        // Revalidate across retention I/O before touching mutable authority.
        try {
          const latest = snapshot(
            await options.readDescriptor(input.subject, input.entityCode),
          );
          if (
            !input.signal.aborted &&
            now() < finishedAtMs + options.validityMs &&
            hash(latest) === hash(descriptor) &&
            hash(options.describe(latest)) === hash(binding) &&
            (await options.authority.authorize(input.subject, binding.target))
          ) {
            published = await options.authority.compareAndSwap({
              subject: input.subject,
              expected,
              next: {
                target: binding.target,
                adapterVersions: binding.adapterVersions,
                supportRevision: evidenceHash,
                receiptHash,
              },
            });
          }
        } catch {
          publicationError = "authority_update_failed";
        }
      }
      await retain(`${prefix}/publication.json`, {
        attemptId,
        receiptHash,
        evidenceHash,
        published,
        ...(publicationError ? { error: publicationError } : {}),
      });
      return Object.freeze({
        attemptId,
        receiptHash,
        evidenceHash,
        passed,
        published,
      });
    },
  };
}
