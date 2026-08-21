import { validateRuntimeEnvironment } from "../../lib/environment";
export const dynamic = "force-dynamic";
export function createReadinessResponse(environment: NodeJS.ProcessEnv) { const result = validateRuntimeEnvironment(environment); return Response.json({ status: result.ready ? "ready" : "not_ready", plane: "studio" }, { status: result.ready ? 200 : 503, headers: { "cache-control": "no-store" } }); }
export function GET() { return createReadinessResponse(process.env); }
