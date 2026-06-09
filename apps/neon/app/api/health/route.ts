import { NextResponse } from "next/server";
import { getPlaneConfig } from "@athyper/session-plane";
import { PLANE_KEY } from "@/lib/plane";

export function GET() {
  const plane = getPlaneConfig(PLANE_KEY);
  return NextResponse.json({
    ok: true,
    plane: plane.key,
  });
}
