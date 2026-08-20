import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EffectiveAuthorizationEvidence, VerifiedIdentity, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPermissionAuthorizer } from "../permission-authorizer.js";
import { snapshotFromEvidence } from "../kysely-permission-resolver.js";

type GoldenCase = {
  name: string;
  permissionCode: string;
  resource?: Readonly<Record<string, unknown>>;
  evidence: EffectiveAuthorizationEvidence[];
  expected: { allowed: boolean; reason?: string };
};
type Corpus = { contractVersion: string; identity: VerifiedIdentity; cases: GoldenCase[] };

const corpus = JSON.parse(readFileSync(
  new URL("../__fixtures__/authorization-golden-corpus.v1.json", import.meta.url), "utf8",
)) as Corpus;

describe(corpus.contractVersion, () => {
  for (const item of corpus.cases) {
    it(item.name, async () => {
      const permissions = snapshotFromEvidence(corpus.identity, item.evidence, 1);
      const context: VerifiedRequestContext = {
        ...corpus.identity,
        requestId: `golden:${item.name}`,
        profileHash: permissions.profileHash,
        permissions,
      };
      const result = await createPermissionAuthorizer().authorize({
        context,
        permissionCode: item.permissionCode,
        ...(item.resource ? { resource: item.resource } : {}),
      });
      expect(result).toMatchObject(item.expected);
    });
  }
});
