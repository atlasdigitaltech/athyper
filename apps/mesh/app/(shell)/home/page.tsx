import type { Metadata } from "next";
import { MeshExperienceSurface } from "@/lib/experience-runtime";

export const metadata: Metadata = { title: "Home" };
export default function MeshHomePage() {
  return <MeshExperienceSurface surfaceKey="mesh.home"/>;
}
