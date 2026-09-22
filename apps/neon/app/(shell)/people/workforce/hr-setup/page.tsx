import type {Metadata} from "next";
import {HrSetup} from "@athyper/product-neon-workforce";
import {NeonRouteEntitlement} from "@/lib/experience-runtime";
export const metadata:Metadata={title:"HR setup"};
export default function Page(){return <NeonRouteEntitlement workspaceCode="ppl" moduleCode="hr"><HrSetup/></NeonRouteEntitlement>;}
