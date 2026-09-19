import { NextResponse } from "next/server";
/** Mesh owns authentication and authorized buyer-account selection. No tokens cross the URL. */
export async function GET() {
  const configured = process.env.MESH_APP_ORIGIN;
  const neon = new URL(
    process.env.APP_ORIGIN ??
      process.env.NEXT_PUBLIC_APP_ORIGIN ??
      "http://localhost:3000",
  );
  if (!configured && !neon.hostname.startsWith("neon."))
    return NextResponse.json(
      { message: "Mesh application origin is not configured" },
      { status: 503 },
    );
  const mesh = configured
    ? new URL(configured)
    : new URL(`${neon.protocol}//${neon.host.replace(/^neon\./, "mesh.")}`);
  const target = new URL("/api/auth/login", mesh);
  target.searchParams.set(
    "returnTo",
    "/network-relationships/marketplace/buyer-discovery",
  );
  return NextResponse.redirect(target);
}
