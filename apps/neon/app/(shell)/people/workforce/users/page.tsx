import type {Metadata} from "next";
import {UserDirectory} from "@athyper/product-neon-workforce";
import {NeonRouteEntitlement} from "@/lib/experience-runtime";
export const metadata:Metadata={title:"Users"};
export default function Page(){return <NeonRouteEntitlement workspaceCode="ppl" moduleCode="hr"><UserDirectory/></NeonRouteEntitlement>;}
