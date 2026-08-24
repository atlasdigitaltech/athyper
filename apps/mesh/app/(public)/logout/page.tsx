import { LogoutGatePage } from "@athyper/platform-iam-identity-gate";
import { readAuthCsrfCookie } from "@athyper/platform-iam-auth-bff";
import { headers } from "next/headers";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign out" };

export default async function LogoutPage() { const incoming = await headers(); return <LogoutGatePage plane="mesh" csrfToken={readAuthCsrfCookie(incoming.get("cookie"), process.env.NODE_ENV === "production")} />; }
