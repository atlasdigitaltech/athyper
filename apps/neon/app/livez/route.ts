export const dynamic = "force-dynamic"; export function GET() { return Response.json({ status: "live", plane: "neon" }, { headers: { "cache-control": "no-store" } }); }
