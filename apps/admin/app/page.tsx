import { redirect } from "next/navigation";
import { getPlaneConfig } from "@athyper/session-plane";
import { PLANE_KEY } from "@/lib/plane";

export default function HomePage() {
  redirect(getPlaneConfig(PLANE_KEY).defaultPath);
}
