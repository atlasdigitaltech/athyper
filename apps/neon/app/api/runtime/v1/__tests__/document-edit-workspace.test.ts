import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import { buildDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
import {
  inspectDocumentEditWorkspaceToken,
  mintDocumentEditWorkspaceToken,
} from "@/lib/server/document-edit-workspace-token";
import {
  resolveDocumentEditPlanHash,
  validateDocumentEditWorkspace,
  resolveDocumentEditWorkspaceProfile,
} from "@/lib/server/document-edit-workspace-validation";
import { isDocumentSaveAndTransitionEnabled } from "@/lib/server/document-edit-submit-policy";

const LEGACY_SECRET = "legacy-workspace-secret-at-least-32-characters";
const OLD_SECRET = "old-workspace-key-secret-at-least-32-characters";
const NEW_SECRET = "new-workspace-key-secret-at-least-32-characters";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function context(overrides: {
  routeRecordId?: string;
  physicalRecordId?: string;
  roles?: string[];
  planHash?: string;
} = {}): DocumentEditRuntimeRouteContext {
  return {
    session: {
      activeOrg: "org-1",
      activeWorkbench: "buyer",
      planeKey: "neon",
      realmKey: "athyper",
      userId: "principal-1",
      organizations: {
        "org-1": {
          tenantId: "tenant-1",
          roles: overrides.roles ?? ["buyer"],
          workspaceId: "workspace-1",
        },
      },
    },
    entityCode: "purchase_order",
    recordId: overrides.routeRecordId ?? "PO-1001",
    record: {
      id: overrides.physicalRecordId ?? "019f5b15-c6db-7b6d-ad89-5ffe152d5b30",
      data: {},
    },
    editRuntime: {
      schemaVersion: "document-edit-runtime/v6.0",
      planHash: overrides.planHash ?? "purchase-order-plan-v1",
    },
    descriptor: {},
  } as unknown as DocumentEditRuntimeRouteContext;
}

function configureLegacySecret(): void {
  vi.stubEnv("DOCUMENT_EDIT_WORKSPACE_TOKEN_SECRET", LEGACY_SECRET);
  vi.stubEnv("DOCUMENT_EDIT_WORKSPACE_TOKEN_KEYS", "");
  vi.stubEnv("DOCUMENT_EDIT_WORKSPACE_TOKEN_ACTIVE_KID", "");
}

function mintForContext(
  current: DocumentEditRuntimeRouteContext,
  overrides: Partial<Parameters<typeof mintDocumentEditWorkspaceToken>[0]> = {},
): string {
  const identity = buildDocumentEditCoordinatorIdentity(current.session, current.record)!;
  const planHash = resolveDocumentEditPlanHash(current);
  if (!planHash) throw new Error("test context has no compiler-owned plan hash");
  const token = mintDocumentEditWorkspaceToken({
    tenantId: identity.tenantId,
    principalId: identity.effectivePrincipal,
    entityCode: current.entityCode,
    recordId: String(current.record.id),
    permissionStamp: identity.permissionStamp,
    planHash,
    profile: "edit",
    ...overrides,
  });
  if (!token) throw new Error("test token was not minted");
  return token;
}

async function errorBody(result: ReturnType<typeof validateDocumentEditWorkspace>) {
  if (result.ok) throw new Error("expected workspace validation failure");
  return {
    status: result.response.status,
    body: await result.response.json() as { error: string; message: string },
    security: result.response.headers.get("X-Document-Edit-Security"),
  };
}

describe("document edit workspace token rotation", () => {
  it("refuses to mint a capability without an actual plan hash", () => {
    configureLegacySecret();
    const current = context();
    const identity = buildDocumentEditCoordinatorIdentity(current.session, current.record)!;
    expect(mintDocumentEditWorkspaceToken({
      tenantId: identity.tenantId,
      principalId: identity.effectivePrincipal,
      entityCode: current.entityCode,
      recordId: String(current.record.id),
      permissionStamp: identity.permissionStamp,
      planHash: "",
      profile: "edit",
    })).toBeNull();
  });

  it("mints with the active key ID and verifies tokens from retained keys", () => {
    vi.stubEnv("DOCUMENT_EDIT_WORKSPACE_TOKEN_SECRET", "");
    vi.stubEnv("DOCUMENT_EDIT_WORKSPACE_TOKEN_KEYS", JSON.stringify({ old_2026: OLD_SECRET, new_2026: NEW_SECRET }));
    vi.stubEnv("DOCUMENT_EDIT_WORKSPACE_TOKEN_ACTIVE_KID", "old_2026");
    const oldToken = mintForContext(context());
    expect(oldToken.split(".")[1]).toBe("old_2026");

    vi.stubEnv("DOCUMENT_EDIT_WORKSPACE_TOKEN_ACTIVE_KID", "new_2026");
    const newToken = mintForContext(context());
    expect(newToken.split(".")[1]).toBe("new_2026");
    expect(inspectDocumentEditWorkspaceToken(oldToken).valid).toBe(true);
    expect(inspectDocumentEditWorkspaceToken(newToken).valid).toBe(true);
  });

  it("continues to verify pre-key-ID legacy tokens", () => {
    configureLegacySecret();
    const current = context();
    const identity = buildDocumentEditCoordinatorIdentity(current.session, current.record)!;
    const planHash = resolveDocumentEditPlanHash(current);
    if (!planHash) throw new Error("test context has no compiler-owned plan hash");
    const payload = Buffer.from(JSON.stringify({
      tenantId: identity.tenantId,
      principalId: identity.effectivePrincipal,
      entityCode: current.entityCode,
      recordId: current.record.id,
      permissionStamp: identity.permissionStamp,
      planHash,
      profile: "edit",
      expiresAt: Date.now() + 60_000,
    })).toString("base64url");
    const signature = createHmac("sha256", LEGACY_SECRET).update(payload).digest("base64url");

    expect(inspectDocumentEditWorkspaceToken(`dew1.${payload}.${signature}`).valid).toBe(true);
  });

  it("rejects an unknown key ID without exposing token material", async () => {
    configureLegacySecret();
    const token = "dew1.unknown.payload.signature";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(inspectDocumentEditWorkspaceToken(token)).toEqual({ valid: false, reason: "unknown_key" });
    const failure = await errorBody(validateDocumentEditWorkspace({
      request: new Request("https://neon.local/edit", { headers: { "x-document-edit-workspace": token } }),
      context: context(),
    }));
    expect(failure.body.error).toBe("INVALID_WORKSPACE");
    expect(JSON.stringify(failure.body)).not.toContain(token);
    expect(JSON.stringify(info.mock.calls)).not.toContain(token);
  });
});

describe("document submit policy", () => {
  it("can disable save_and_transition without disabling workspace save", () => {
    expect(isDocumentSaveAndTransitionEnabled({
      tenantId: "tenant-1",
      entityCode: "purchase_order",
      env: {
        DOCUMENT_EDIT_SAVE_AND_TRANSITION_DISABLED: "tenant-1:purchase_order",
      },
    })).toBe(false);
  });
});

describe("central document workspace validation", () => {
  it("uses the create profile only while an EARLY_DRAFT record is provisional", () => {
    const current = context();
    current.descriptor = { createMode: "EARLY_DRAFT" } as never;
    current.record = { ...current.record, data: { is_provisional: true } };
    expect(resolveDocumentEditWorkspaceProfile(current)).toBe("create");
    current.record = { ...current.record, data: { is_provisional: false } };
    expect(resolveDocumentEditWorkspaceProfile(current)).toBe("edit");
  });

  it("returns WORKSPACE_REQUIRED when the capability is absent", async () => {
    configureLegacySecret();
    const failure = await errorBody(validateDocumentEditWorkspace({
      request: new Request("https://neon.local/edit"),
      context: context(),
    }));
    expect(failure).toMatchObject({ status: 428, body: { error: "WORKSPACE_REQUIRED" } });
  });

  it("returns STALE_WORKSPACE for expiry, changed permissions, and changed plan hash", async () => {
    configureLegacySecret();
    const original = context();
    const expired = mintForContext(original, { ttlMs: -1 });
    const permissionToken = mintForContext(original);
    const planToken = mintForContext(original);

    for (const [token, current] of [
      [expired, original],
      [permissionToken, context({ roles: ["buyer", "approver"] })],
      [planToken, context({ planHash: "purchase-order-plan-v2" })],
    ] as const) {
      const failure = await errorBody(validateDocumentEditWorkspace({
        request: new Request("https://neon.local/edit", { headers: { "x-document-edit-workspace": token } }),
        context: current,
      }));
      expect(failure.body.error).toBe("STALE_WORKSPACE");
    }
  });

  it("invalidates an active edit when metadata publishes a new plan hash", async () => {
    configureLegacySecret();
    const openedContext = context({ planHash: "purchase-order-plan-v1" });
    const activeToken = mintForContext(openedContext);
    const inspected = inspectDocumentEditWorkspaceToken(activeToken);
    expect(inspected).toMatchObject({
      valid: true,
      scope: { planHash: "purchase-order-plan-v1" },
    });

    const updatedMetadataContext = context({ planHash: "purchase-order-plan-v2" });
    const failure = await errorBody(validateDocumentEditWorkspace({
      request: new Request("https://neon.local/edit", {
        headers: { "x-document-edit-workspace": activeToken },
      }),
      context: updatedMetadataContext,
    }));

    expect(failure).toMatchObject({
      status: 409,
      security: "workspace-plan-stale",
      body: { error: "STALE_WORKSPACE" },
    });
  });

  it("keeps permission-stamp changes independently stale", async () => {
    configureLegacySecret();
    const activeToken = mintForContext(context({ roles: ["buyer"] }));
    const failure = await errorBody(validateDocumentEditWorkspace({
      request: new Request("https://neon.local/edit", {
        headers: { "x-document-edit-workspace": activeToken },
      }),
      context: context({ roles: ["buyer", "approver"] }),
    }));
    expect(failure).toMatchObject({
      status: 409,
      security: "workspace-permissions-stale",
      body: { error: "STALE_WORKSPACE" },
    });
  });

  it("does not derive a compatibility plan hash for v5 or malformed runtimes", () => {
    const current = context();
    expect(resolveDocumentEditPlanHash({
      ...current,
      editRuntime: { schemaVersion: "document-edit-runtime/v5.0" },
    } as unknown as DocumentEditRuntimeRouteContext)).toBeNull();
    expect(resolveDocumentEditPlanHash({
      ...current,
      editRuntime: { schemaVersion: "document-edit-runtime/v6.0", planHash: "" },
    } as unknown as DocumentEditRuntimeRouteContext)).toBeNull();
  });

  it("distinguishes profile denial from invalid document scope", async () => {
    configureLegacySecret();
    const current = context();
    const approveToken = mintForContext(current, { profile: "approve" });
    const wrongRecordToken = mintForContext(current, { recordId: "another-record" });

    const profileFailure = await errorBody(validateDocumentEditWorkspace({
      request: new Request("https://neon.local/edit", { headers: { "x-document-edit-workspace": approveToken } }),
      context: current,
    }));
    expect(profileFailure).toMatchObject({ status: 403, body: { error: "WORKSPACE_PROFILE_DENIED" } });

    const scopeFailure = await errorBody(validateDocumentEditWorkspace({
      request: new Request("https://neon.local/edit", { headers: { "x-document-edit-workspace": wrongRecordToken } }),
      context: current,
    }));
    expect(scopeFailure.body.error).toBe("INVALID_WORKSPACE");
  });

  it("matches the physical record ID and gives the header precedence over hydrate compatibility input", async () => {
    configureLegacySecret();
    const current = context({ routeRecordId: "PO-1001", physicalRecordId: "physical-uuid" });
    const validBodyToken = mintForContext(current);
    const result = validateDocumentEditWorkspace({
      request: new Request("https://neon.local/edit", { headers: { "x-document-edit-workspace": "bad-header-token" } }),
      context: current,
      compatibilityBodyToken: validBodyToken,
    });
    const failure = await errorBody(result);
    expect(failure.body.error).toBe("INVALID_WORKSPACE");

    const compatibilityResult = validateDocumentEditWorkspace({
      request: new Request("https://neon.local/edit"),
      context: current,
      compatibilityBodyToken: validBodyToken,
    });
    expect(compatibilityResult).toMatchObject({ ok: true, tokenSource: "compatibility_body" });
  });
});

describe("workspace lifecycle route guard wiring", () => {
  const editRouteRoot = new URL("../entities/", import.meta.url);

  it.each(["hydrate", "resolve-change", "preflight", "submit", "discard", "revert-to-baseline"])(
    "routes %s through the centralized workspace validator",
    (operation) => {
      const source = readFileSync(new URL(`[entity]/[id]/edit/${operation}/route.ts`, editRouteRoot), "utf8");
      expect(source).toContain("validateDocumentEditWorkspace");
      expect(source).not.toContain("hasValidEditWorkspace");
      expect(source).not.toContain("workspaceScopeMatches");
    },
  );

  it("keeps discard_draft separate from baseline reversal", () => {
    const discard = readFileSync(new URL("[entity]/[id]/edit/discard/route.ts", editRouteRoot), "utf8");
    const revert = readFileSync(new URL("[entity]/[id]/edit/revert-to-baseline/route.ts", editRouteRoot), "utf8");
    expect(discard).toContain("DocumentEditDiscardDraftRequestV1Schema");
    expect(discard).toContain('operation: "discard_draft"');
    expect(discard).not.toContain("revert_to_baseline");
    expect(revert).toContain("DocumentEditRevertToBaselineRequestV1Schema");
    expect(revert).toContain("revert-to-baseline");
    expect(revert).not.toContain("deleteDocumentEditServerDraft");
  });

  it("keeps OPEN as the capability issuer and HYDRATE body input as compatibility-only", () => {
    const open = readFileSync(new URL("[entity]/[id]/edit/open/route.ts", editRouteRoot), "utf8");
    const hydrate = readFileSync(new URL("[entity]/[id]/edit/hydrate/route.ts", editRouteRoot), "utf8");
    expect(open).toContain("mintDocumentEditWorkspaceToken");
    expect(open).not.toContain("validateDocumentEditWorkspace({");
    expect(hydrate).toContain('compatibilityBodyToken: readString(body, "workspaceId")');
  });

  it("rolls out OPEN projections safely and seeds security-scoped caches before consumers", () => {
    const open = readFileSync(new URL("[entity]/[id]/edit/open/route.ts", editRouteRoot), "utf8");
    const flags = readFileSync(resolve(process.cwd(), "lib/server/document-runtime-feature-flags.ts"), "utf8");
    const context = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-canvas/src/document-runtime/document-runtime-context.tsx",
    ), "utf8");
    const coordinator = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-canvas/src/document-runtime/document-edit-coordinator.tsx",
    ), "utf8");
    const contextBody = context.slice(context.indexOf("function DocumentRuntimeContextBody"));

    expect(flags).toContain("DOCUMENT_OPEN_ROLLOUT_STAGE");
    expect(flags).toContain("stableRolloutBucket");
    expect(open).toContain("loadOptionalOpenProjection");
    expect(open).toContain('"workspace_compatibility_fetch"');
    expect(contextBody.indexOf("seedDocumentOpenProjections")).toBeLessThan(contextBody.indexOf("useDocumentChildren"));
    expect(contextBody.indexOf("seedDocumentOpenProjections")).toBeLessThan(contextBody.indexOf("useDocumentRules"));
    expect(coordinator).toContain("buildDocumentRulesQueryKey(projection.entity, identity");
    expect(coordinator).toContain("buildCompiledEntityQueryKey(entityCode, identity)");
  });

  it("keeps the active document page adapter but removes its legacy save transport", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      "app/(shell)/app/[entity]/[id]/DocumentObjectPageClient.tsx",
    ), "utf8");
    const workspaceSource = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-canvas/src/record/document-object-page-workspace.tsx",
    ), "utf8");
    expect(workspaceSource).toContain("editCoordinator.openWorkspace()");
    expect(workspaceSource).toContain('core["draftContext"]');
    expect(workspaceSource).not.toContain("useSubmitPreflight(");
    expect(source).not.toContain("streamUrl");
    expect(source).not.toContain("saveEditSession");
    expect(source).not.toMatch(/\/api\/[^"'\n]*\/edit-session/);
    const contractSource = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-contracts/src/document-edit-runtime-compiler.ts",
    ), "utf8");
    const descriptorSource = readFileSync(resolve(
      process.cwd(),
      "lib/server/meta-entity-runtime.ts",
    ), "utf8");
    expect(descriptorSource).toContain("isDocumentSaveAndTransitionEnabled");
    expect(contractSource).not.toContain("transportMode");

    const lineGridSource = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-line-item/src/surface/lines-grid.tsx",
    ), "utf8");
    expect(lineGridSource).toContain("submitWorkspaceChanges({");
    expect(lineGridSource).toContain("lines: { update: updates }");
    expect(lineGridSource).not.toMatch(/\/api\/[^"'\n]*\/edit-session/);

    const deprecatedSource = readFileSync(resolve(
      process.cwd(),
      "../../packages/product-deprecated/runtime-ui/document-runtime/src/pages/DocumentDetailPage.tsx",
    ), "utf8");
    expect(deprecatedSource).toContain("/edit/open");
    expect(deprecatedSource).toContain("/edit/submit");
    expect(deprecatedSource).not.toContain("TRANSPORT_MODE_MISMATCH");
    expect(deprecatedSource).not.toContain("/edit-session");
    expect(deprecatedSource).toContain('"Idempotency-Key": attempt.idempotencyKey');
  });

  it("keeps event credentials out of URLs and uses OPEN as the edit-page record bootstrap", () => {
    const coordinator = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-canvas/src/document-runtime/document-edit-coordinator.tsx",
    ), "utf8");
    const security = readFileSync(resolve(
      process.cwd(),
      "lib/server/document-edit-runtime-security.ts",
    ), "utf8");
    const editPage = readFileSync(resolve(
      process.cwd(),
      "app/(shell)/app/[entity]/[id]/edit/page.tsx",
    ), "utf8");
    expect(coordinator).toContain("new EventSource(\n      endpoints.events");
    expect(coordinator).not.toContain("permission_stamp");
    expect(security).not.toContain("searchParams");
    expect(editPage).toContain("DocumentEditBootstrapClient");
    expect(editPage).toContain("resolveMetaEntityEditRoute(descriptor)");
    expect(editPage).toContain("missing its compiled edit runtime");
    expect(editPage).toContain('routeDecision.kind === "reject"');
    expect(editPage).toContain("notFound()");
  });

  it("keeps document bootstrap data authoritative across fields and line surfaces", () => {
    const fieldsSurface = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-canvas/src/surfaces/fields-surface.tsx",
    ), "utf8");
    const lineSurface = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-canvas/src/surfaces/line-items-surface.tsx",
    ), "utf8");
    const lineGrid = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-line-item/src/surface/lines-grid.tsx",
    ), "utf8");

    expect(fieldsSurface).toContain("readSelectedOptionLabels(documentEditCoordinator?.initialCore)");
    expect(fieldsSurface).toContain("optionBatchContext={optionBatchContext}");
    expect(lineSurface).toContain("controlledData={controlledData}");
    expect(lineSurface).toContain("documentRuntime.children.lines");
    expect(lineGrid).toContain('accountingLine ? "accounting_distribution" : null');
  });

  it("secures and consolidates document field-option batches", () => {
    const formSource = readFileSync(resolve(
      process.cwd(),
      "../../packages/shared/runtime-domain/runtime-canvas/src/edit/runtime-edit-form.tsx",
    ), "utf8");
    const batchRoute = readFileSync(
      new URL("[entity]/[id]/edit/field-options/batch/route.ts", editRouteRoot),
      "utf8",
    );
    const singleRoute = readFileSync(
      new URL("[entity]/fields/[field]/options/route.ts", editRouteRoot),
      "utf8",
    );

    expect(formSource).toContain('import { csrfFetch } from "@athyper/runtime-shared/client"');
    expect(formSource).toContain("csrfFetch(batchContext.endpoint");
    expect(batchRoute).toContain("resolveRuntimeFieldOptions");
    expect(batchRoute).toContain("MAX_BATCH_CONCURRENCY = 8");
    expect(batchRoute).not.toContain("GET as resolveSingleFieldOptions");
    expect(batchRoute).not.toContain("buildSingleFieldRequest");
    expect(singleRoute).toContain("runtimeHeaders: buildRuntimeHeaders(session)");
  });
});
