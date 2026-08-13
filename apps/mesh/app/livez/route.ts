export const dynamic = "force-dynamic"; export function GET() { return Response.json({ status: "live", plane: "mesh" }, { headers: { "cache-control": "no-store" } }); }
