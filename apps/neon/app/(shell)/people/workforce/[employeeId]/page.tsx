import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Employee360 } from "@athyper/product-neon-workforce";
import { NeonRouteEntitlement } from "@/lib/experience-runtime";
import { isEntityId } from "@/lib/route-params";

export const metadata: Metadata = { title: "Employee 360" };
export default async function EmployeePage({params}:{readonly params:Promise<{readonly employeeId:string}>}){const{employeeId}=await params;if(!isEntityId(employeeId))notFound();return <NeonRouteEntitlement workspaceCode="ppl" moduleCode="hr"><Employee360 employeeId={employeeId}/></NeonRouteEntitlement>;}
