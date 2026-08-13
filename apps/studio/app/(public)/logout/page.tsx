import { LogoutGatePage } from "@athyper/platform-iam-identity-gate";
import { readAuthCsrfCookie } from "@athyper/platform-iam-auth-bff";
import { headers } from "next/headers";

export default async function LogoutPage() { const incoming = await headers(); return <LogoutGatePage plane="studio" csrfToken={readAuthCsrfCookie(incoming.get("cookie"), process.env.NODE_ENV === "production")} />; }
