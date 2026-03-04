import { getSessionId } from "@neon/auth/session";
import * as contentService from "@neon/content/server";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Validation schema for upload completion request
 */
const CompleteSchema = z.object({
  uploadId: z.string().uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "Invalid SHA-256 hash"),
});

/**
 * POST /api/content/complete
 *
 * Complete file upload after client has uploaded to S3.
 *
 * Flow:
 * 1. Validate session
 * 2. Validate uploadId + sha256 checksum
 * 3. Call runtime API to verify S3 object exists and finalize record
 * 4. Return success
 *
 * CSRF-protected via middleware.
 */
export async function POST(req: Request) {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Session required" },
      },
      { status: 401 },
    );
  }

  const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";

  try {
    const body = await req.json();
    const parsed = CompleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request",
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const { uploadId, sha256 } = parsed.data;

    await contentService.completeUpload({
      uploadId,
      sha256,
      tenantId,
      actorId: sid, // TODO: Replace with actual user ID from session
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Upload completion error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const code = (err as Record<string, unknown>)?.code;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: code ?? "INTERNAL_ERROR",
          message,
        },
      },
      { status: 500 },
    );
  }
}
