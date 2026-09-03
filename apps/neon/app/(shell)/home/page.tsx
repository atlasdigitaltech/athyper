import type { Metadata } from "next";
import { NeonExperienceSurface } from "@/lib/experience-runtime";

export const metadata: Metadata = { title: "Home" };
export default function NeonHomePage() {
  return <NeonExperienceSurface surfaceKey="neon.home"/>;
}
