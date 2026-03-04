import { cookies } from "next/headers";

import type { Session, WorkbenchType } from "./types.js";

const COOKIE_NAME = "neon_session";

export async function setSession(session: Session) {
  (await cookies()).set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // set true behind HTTPS
    path: "/"
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function getWorkbenchFromSession(): Promise<WorkbenchType | null> {
  return (await getSession())?.workbench ?? null;
}
