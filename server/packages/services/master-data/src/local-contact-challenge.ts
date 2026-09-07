import { createHash, createPrivateKey, randomBytes, randomUUID, sign, timingSafeEqual } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MasterDataServiceOptions } from "./services.js";
import { createMasterDataServices } from "./services.js";
import { contactVerificationSigningBytes } from "./provider-evidence-verifier.js";
import { MasterDataError } from "./errors.js";

export interface ContactChallenge {
  id: string; tenantId: string; principalId: string; contactId: string;
  value: string; tokenHash: string; expiresAt: string; consumedAt: string | null;
}
export interface ContactChallengeRepository<T> {
  insert(challenge: ContactChallenge, tx: T): Promise<void>;
  lock(tenantId: string, id: string, tx: T): Promise<ContactChallenge | undefined>;
  consume(tenantId: string, id: string, tx: T): Promise<void>;
  /** Atomic persistent per-principal window counter, committed independently of completion. */
  attempt(tenantId: string, principalId: string, operation: string, tx: T): Promise<number>;
}
export interface LocalChallengeConfiguration {
  environment: string; capture: boolean; tenantId: string; privateKeyPem: string;
  keyId: string; pageUrl: string;
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fail(status: number, code: string): never { throw new MasterDataError(status, code, code); }
export function createLocalContactChallenges<T>(options: MasterDataServiceOptions<T>, repository: ContactChallengeRepository<T>, config: LocalChallengeConfiguration,
  deliver: (input: { context: VerifiedRequestContext; destination: string; link: string }, transaction: T) => Promise<void>) {
  if (config.environment !== "local" || !config.capture) throw new Error("Local challenges require local capture mode");
  const page = new URL(config.pageUrl);
  if (page.protocol !== "https:" || !page.hostname.endsWith(".dev.athyper.test") || page.search || page.hash || page.username || page.password) throw new Error("Local challenge page must use the development HTTPS origin");
  const key = createPrivateKey(config.privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Local challenge key must be Ed25519");
  const now = () => options.now?.() ?? new Date();
  const actor = (c: VerifiedRequestContext) => ({ tenantId: c.tenantId, principalId: c.principalId });
  async function scope(c: VerifiedRequestContext) {
    if (c.planeKey !== "neon" || c.tenantId !== config.tenantId) fail(403, "CHALLENGE_SCOPE_DENIED");
  }
  async function permission(c: VerifiedRequestContext, contactId: string, tx: T) {
    if (options.authorizeVerification) return options.authorizeVerification(c, contactId, tx);
    fail(503, "MASTER_DATA_AUTHORITY_UNAVAILABLE");
  }
  async function throttle(c: VerifiedRequestContext, operation: string, limit: number) {
    const count = await options.transactions.run(c.planeKey, actor(c), tx => repository.attempt(c.tenantId, c.principalId, operation, tx));
    if (count > limit) fail(429, "CHALLENGE_RATE_LIMITED");
  }
  return {
    async request(context: VerifiedRequestContext, contactId: string) {
      await scope(context);
      await options.transactions.run(context.planeKey, actor(context), tx => permission(context, contactId, tx));
      await throttle(context, "request", 3);
      const token = randomBytes(32).toString("base64url");
      const challenge = await options.transactions.run(context.planeKey, actor(context), async tx => {
        await permission(context, contactId, tx);
        const current = await options.repository.getContactForVerification(context.tenantId, contactId, tx);
        if (!current) fail(404, "CONTACT_NOT_FOUND");
        if (current.status !== "active" || Date.parse(current.effectiveFrom) > now().getTime() || (current.effectiveUntil && Date.parse(current.effectiveUntil) <= now().getTime())) fail(422, "CHALLENGE_CONTACT_INACTIVE");
        if (current.channelType !== "email") fail(422, "CHALLENGE_EMAIL_REQUIRED");
        const challenge: ContactChallenge = { id: randomUUID(), tenantId: context.tenantId, principalId: context.principalId, contactId: current.id, value: current.value, tokenHash: hash(token), expiresAt: new Date(now().getTime() + 600_000).toISOString(), consumedAt: null };
        await repository.insert(challenge, tx);
        await deliver({ context, destination: challenge.value, link: `${page.href}#${challenge.id}.${token}` }, tx);
        return challenge;
      });
      return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
    },
    async complete(context: VerifiedRequestContext, id: string, token: string) {
      await scope(context); await throttle(context, "complete", 10);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(422, "CHALLENGE_INVALID");
      return options.transactions.run(context.planeKey, actor(context), async tx => {
        const challenge = await repository.lock(context.tenantId, id, tx);
        if (!challenge || challenge.principalId !== context.principalId || !timingSafeEqual(Buffer.from(challenge.tokenHash, "hex"), Buffer.from(hash(token), "hex"))) fail(422, "CHALLENGE_INVALID");
        await permission(context, challenge.contactId, tx);
        if (challenge.consumedAt) fail(409, "CHALLENGE_ALREADY_CONSUMED");
        if (Date.parse(challenge.expiresAt) <= now().getTime()) fail(422, "CHALLENGE_EXPIRED");
        const contact = await options.repository.getContactForVerification(context.tenantId, challenge.contactId, tx);
        if (!contact || contact.status !== "active" || Date.parse(contact.effectiveFrom) > now().getTime() || (contact.effectiveUntil && Date.parse(contact.effectiveUntil) <= now().getTime()) || contact.channelType !== "email" || contact.value !== challenge.value) fail(422, "CHALLENGE_TARGET_CHANGED");
        const envelope = { provider: "athyper-local-challenge", keyId: config.keyId, evidenceId: challenge.id, issuedAt: now().toISOString(), expiresAt: challenge.expiresAt };
        const bytes = contactVerificationSigningBytes(envelope, { planeKey: context.planeKey, tenantId: context.tenantId, contactId: contact.id, channelType: contact.channelType, value: contact.value, verified: true });
        const evidence = { ...envelope, payloadHash: createHash("sha256").update(bytes).digest("hex"), signature: sign(null, bytes, key).toString("base64url") };
        // Reuse the existing authorization/verifier/audit/outbox path in this exact transaction.
        const services = createMasterDataServices({ ...options, transactions: { run: async (_plane, _actor, work) => work(tx) } });
        const result = await services.contacts.changeVerification({ context, contactId: contact.id, verified: true, evidence });
        await repository.consume(context.tenantId, challenge.id, tx);
        return { contactId: result.id, verified: result.isVerified };
      });
    },
  };
}
