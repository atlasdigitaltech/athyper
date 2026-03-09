// WRONG LOCATION — this file is at /resolving (route group strips "(auth)").
// The actual page is at app/auth/resolving/page.tsx → /auth/resolving.
// This file just redirects to the correct URL.
import { redirect } from "next/navigation";

async function getSession() {
  const cookieStore = await cookies();
  const sid = cookieStore.get("neon_sid")?.value;
  if (!sid) return null;

  const realmCookie = cookieStore.get("neon_realm")?.value;
  const sessionNamespace =
    realmCookie === "platform"
      ? "platform"
      : (process.env.DEFAULT_TENANT_ID ?? "default");

  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379/0",
      socket: { connectTimeout: 3000, reconnectStrategy: false },
    });
    redis.on("error", () => {});
    if (!redis.isOpen) await redis.connect();

    const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    await redis?.quit();
  }
}

interface ResolvingPageProps {
  searchParams: Promise<{ returnUrl?: string }>;
}

export default async function ResolvingPage({ searchParams }: ResolvingPageProps) {
  const { returnUrl } = await searchParams;
  const target = returnUrl
    ? `/auth/resolving?returnUrl=${encodeURIComponent(returnUrl)}`
    : "/auth/resolving";
  redirect(target);
}
