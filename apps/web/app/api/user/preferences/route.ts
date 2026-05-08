import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";
import {
  extractThemePresetFromPreferences,
  THEME_PRESET_COOKIE,
  THEME_PRESET_COOKIE_MAX_AGE,
} from "@/lib/preferences/ui-profile";

/**
 * GET  /api/user/preferences — current user's persisted UI preferences
 * PATCH /api/user/preferences — save UI preferences to backend
 *
 * Body (PATCH): { appearance_mode?, density_code?, metadata? }
 * Response (GET/PATCH success): { appearance_mode, density_code, metadata }
 */

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/platform/preferences`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });
    if (res.ok && isRecord(data)) syncThemePresetCookie(response, data);
    return response;
  } catch {
    return NextResponse.json({ appearance_mode: null, density_code: null, metadata: {} });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as Record<string, unknown>;
    const res = await fetch(`${RUNTIME_API_URL}/api/platform/preferences`, {
      method: "PATCH",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });
    if (res.ok) syncThemePresetCookie(response, body);
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}

function syncThemePresetCookie(response: NextResponse, profile: Record<string, unknown>) {
  const themePreset = extractThemePresetFromPreferences(profile);

  response.cookies.set(THEME_PRESET_COOKIE, themePreset ?? "", {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: themePreset ? THEME_PRESET_COOKIE_MAX_AGE : 0,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
