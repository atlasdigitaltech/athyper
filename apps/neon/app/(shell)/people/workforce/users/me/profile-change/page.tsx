import type {Metadata} from "next";
import {MyProfileChanges} from "@athyper/product-neon-workforce";
import {NeonRouteEntitlement} from "@/lib/experience-runtime";
export const metadata:Metadata={title:"My profile changes"};
export default function Page(){return <NeonRouteEntitlement workspaceCode="ppl" moduleCode="hr"><MyProfileChanges/></NeonRouteEntitlement>;}
