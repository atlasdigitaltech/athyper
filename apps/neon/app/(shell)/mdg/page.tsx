import type {Metadata} from "next";
import {NeonExperienceSurface} from "@/lib/experience-runtime";
export const metadata:Metadata={title:"Master Data Governance"};
export default function MdgWorkspacePage(){return <NeonExperienceSurface surfaceKey="neon.mdg.home" requiredWorkspaceCode="mdg" context={{workspaceCode:"mdg",moduleCount:"4"}}/>;}
