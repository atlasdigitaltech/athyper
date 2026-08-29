import type { Metadata } from "next";
import { ContentHeader } from "@athyper/platform-shell";
import { AtlasExperienceEditor } from "./experience-editor";

export const metadata:Metadata={title:"Atlas Experience Configuration"};
export default function AtlasExperienceConfigurationPage(){return <section className="athyper-landing" aria-labelledby="page-title"><ContentHeader eyebrow="Business Partner configuration" title="Atlas Experience" description="Configure and publish permission-aware Home widgets, search sources, starter prompts, and AI agent profiles."/><AtlasExperienceEditor/></section>;}
