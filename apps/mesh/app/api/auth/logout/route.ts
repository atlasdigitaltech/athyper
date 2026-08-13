import { auth } from "@/lib/auth";
import { logoutNavigationResponse } from "@athyper/platform-iam-auth-bff";

export const POST = (request: Request) => logoutNavigationResponse(request, auth.logout, process.env.APP_ORIGIN);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
