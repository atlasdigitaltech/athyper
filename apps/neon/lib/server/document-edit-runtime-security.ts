import "server-only";

import { NextResponse } from "next/server";
import type { V4Session } from "@athyper/auth-bff";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { buildDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";

export const DOCUMENT_EDIT_PERMISSION_STAMP_HEADER = "x-document-edit-permission-stamp";

type GuardResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export function assertDocumentEditRuntimeEnabled(): GuardResult {
  if (!isTruthy(process.env.DOCUMENT_EDIT_RUNTIME_DISABLED)) return { ok: true };

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "DOCUMENT_EDIT_RUNTIME_DISABLED",
        message: "The document edit runtime is temporarily disabled.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Document-Edit-Security": "runtime-disabled",
        },
      },
    ),
  };
}

export function validateDocumentEditPermissionStamp(input: {
  request: Request;
  session: V4Session;
  record?: RuntimeRecordRow | Record<string, unknown> | null;
}): GuardResult {
  if (!shouldRequirePermissionStamp()) return { ok: true };

  const expected = buildDocumentEditCoordinatorIdentity(
    input.session,
    input.record as Record<string, unknown> | null | undefined,
  )?.permissionStamp;
  if (!expected) {
    return forbidden(
      "PERMISSION_STAMP_UNAVAILABLE",
      "The active session does not have enough tenant context to load this document.",
      "permission-stamp-unavailable",
    );
  }

  const supplied = readPermissionStamp(input.request);
  if (!supplied) {
    return stale(
      "PERMISSION_STAMP_REQUIRED",
      "Reload the document to refresh your edit session permissions.",
      "permission-stamp-missing",
    );
  }

  if (supplied !== expected) {
    return stale(
      "STALE_PERMISSION_STAMP",
      "Your permissions changed after this edit page was opened. Reload before continuing.",
      "permission-stamp-stale",
    );
  }

  return { ok: true };
}

function shouldRequirePermissionStamp(): boolean {
  if (isFalsy(process.env.DOCUMENT_EDIT_REQUIRE_PERMISSION_STAMP)) return false;
  return true;
}

function readPermissionStamp(request: Request): string | null {
  // Security-sensitive identity material must never be accepted from URLs:
  // query strings leak through browser history, proxies and access logs.
  return request.headers.get(DOCUMENT_EDIT_PERMISSION_STAMP_HEADER);
}

function stale(error: string, message: string, security: string): GuardResult {
  return {
    ok: false,
    response: NextResponse.json(
      { error, message },
      {
        status: 409,
        headers: {
          "Cache-Control": "no-store",
          "X-Document-Edit-Security": security,
        },
      },
    ),
  };
}

function forbidden(error: string, message: string, security: string): GuardResult {
  return {
    ok: false,
    response: NextResponse.json(
      { error, message },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
          "X-Document-Edit-Security": security,
        },
      },
    ),
  };
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isFalsy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off";
}
