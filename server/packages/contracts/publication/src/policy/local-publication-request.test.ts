import { expect, it } from "vitest";
import {
  createLocalPublicationRequest,
  assertLocalPublicationRequest,
  type LocalPublicationInputs,
} from "./local-publication-request.js";
import type {
  LocalDevelopmentAuthority,
  LocalPublicationAdmission,
} from "./local-development-authority.js";
const now = Date.parse("2026-10-09T00:00:00Z");
const host = {
  environment: "local",
  instance: "dev",
  domainSuffix: "dev.athyper.test",
};
const admission: LocalPublicationAdmission = {
  host,
  developerPrincipalId: "developer",
  authorWorkloadId: "author",
  publisherWorkloadId: "publisher",
  scope: { kind: "product" },
  action: "publish",
  targets: [{ plane: "neon", instance: "dev" }],
};
const authority: LocalDevelopmentAuthority = {
  schema: "athyper.local-development-authority/1",
  id: "authority",
  version: 1,
  hash: "a".repeat(64),
  active: true,
  validFrom: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-01T00:00:00Z",
  enrollmentReceiptId: "enrollment",
  host,
  scope: admission.scope,
  developerPrincipalIds: ["developer"],
  authorWorkloadId: "author",
  publisherWorkloadId: "publisher",
  actions: ["publish", "retry", "recover", "rollback"],
  destinations: admission.targets,
};
const source: LocalPublicationInputs = {
  changeSetId: "draft",
  revision: 2,
  sourceHash: "b".repeat(64),
  compilerHash: "c".repeat(64),
  resourceHashes: ["d".repeat(64)],
  targets: [
    {
      plane: "neon",
      instance: "dev",
      predecessorHash: null,
      artifactHash: "e".repeat(64),
    },
  ],
};
it("binds exact inputs and permits unchanged replay", () => {
  const r = createLocalPublicationRequest(authority, admission, source, now);
  for (let n = 0; n < 2; n++)
    expect(() =>
      assertLocalPublicationRequest(r, authority, admission, source, now + n),
    ).not.toThrow();
  for (const changed of [
    { ...source, revision: 3 },
    { ...source, compilerHash: "f".repeat(64) },
    { ...source, resourceHashes: [] },
    {
      ...source,
      targets: [{ ...source.targets[0]!, predecessorHash: "f".repeat(64) }],
    },
  ]) {
    expect(() =>
      assertLocalPublicationRequest(r, authority, admission, changed, now),
    ).toThrow("INPUT_CHANGED");
  }
});
it("renews expired requests only under current authority", () => {
  const r = createLocalPublicationRequest(
    authority,
    admission,
    source,
    now,
    1000,
  );
  expect(() =>
    assertLocalPublicationRequest(r, authority, admission, source, now + 1000),
  ).toThrow("EXPIRED");
  const renewed = createLocalPublicationRequest(
    authority,
    { ...admission, action: "recover" },
    source,
    now + 1000,
  );
  expect(renewed.hash).not.toBe(r.hash);
  expect(() =>
    createLocalPublicationRequest(
      { ...authority, active: false },
      admission,
      source,
      now + 1000,
    ),
  ).toThrow("REVOKED");
});
it("rejects tampering, authority replacement and destination mismatch", () => {
  const r = createLocalPublicationRequest(authority, admission, source, now);
  expect(() =>
    assertLocalPublicationRequest(
      { ...r, hash: "f".repeat(64) },
      authority,
      admission,
      source,
      now,
    ),
  ).toThrow("INPUT_CHANGED");
  expect(() =>
    assertLocalPublicationRequest(
      r,
      { ...authority, version: 2 },
      admission,
      source,
      now,
    ),
  ).toThrow("INPUT_CHANGED");
  expect(() =>
    createLocalPublicationRequest(
      authority,
      admission,
      { ...source, targets: [{ ...source.targets[0]!, plane: "mesh" }] },
      now,
    ),
  ).toThrow("ADMISSION_TARGET_MISMATCH");
});

it("pins the release envelope and predecessor independently of target descriptors", () => {
  const input = {
    ...source,
    release: { descriptorHash: "a".repeat(64), predecessorReleaseId: null },
  };
  const request = createLocalPublicationRequest(
    authority,
    admission,
    input,
    now,
  );
  assertLocalPublicationRequest(request, authority, admission, input, now);
  for (const release of [
    { ...input.release, descriptorHash: "b".repeat(64) },
    {
      ...input.release,
      predecessorReleaseId: "00000000-0000-4000-8000-000000000001",
    },
  ])
    expect(() =>
      assertLocalPublicationRequest(
        request,
        authority,
        admission,
        { ...input, release },
        now,
      ),
    ).toThrow("INPUT_CHANGED");
  expect(() =>
    createLocalPublicationRequest(
      authority,
      admission,
      {
        ...input,
        release: { ...input.release, predecessorReleaseId: "not-an-id" },
      },
      now,
    ),
  ).toThrow("RELEASE_INVALID");
});
