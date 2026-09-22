import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {UserRecord} from "@athyper/product-neon-workforce";
import {NeonRouteEntitlement} from "@/lib/experience-runtime";
export const metadata:Metadata={title:"User & access"};
export default async function Page({params}:{readonly params:Promise<{readonly principalId:string}>}){const {principalId}=await params;if(!/^[0-9a-f-]{36}$/i.test(principalId))notFound();return <NeonRouteEntitlement workspaceCode="ppl" moduleCode="hr"><UserRecord principalId={principalId}/></NeonRouteEntitlement>;}
