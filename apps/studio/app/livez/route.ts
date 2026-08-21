export const dynamic = "force-dynamic"; export function GET() { return Response.json({ status: "live", plane: "studio" }, { headers: { "cache-control": "no-store" } }); }
