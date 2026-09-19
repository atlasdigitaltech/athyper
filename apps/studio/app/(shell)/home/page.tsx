import type { Metadata } from "next";
import { StudioExperienceSurface } from "@/lib/experience-runtime";

export const metadata: Metadata = { title: "Home" };
export default function StudioHomePage() {
  return <StudioExperienceSurface surfaceKey="studio.home"/>;
}
