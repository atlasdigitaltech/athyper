import type {Metadata} from "next";
import {ProfileReviewQueue} from "@athyper/product-neon-workforce";
import {NeonRouteEntitlement} from "@/lib/experience-runtime";
export const metadata:Metadata={title:"Review profile changes"};
export default function Page(){return <NeonRouteEntitlement workspaceCode="ppl" moduleCode="hr"><ProfileReviewQueue/></NeonRouteEntitlement>;}
