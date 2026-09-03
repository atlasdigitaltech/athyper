import type {Metadata} from "next";
import {NeonExperienceSurface} from "@/lib/experience-runtime";
export const metadata:Metadata={title:"Business Partner"};
export default function BusinessPartnerPage(){return <NeonExperienceSurface surfaceKey="neon.mdg.bp.home" requiredWorkspaceCode="mdg" requiredModuleCode="bp" context={{workspaceCode:"mdg",moduleCode:"bp",entityCount:"2"}}/>;}
