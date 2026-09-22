import type { Metadata } from "next";
import { EmployeeDirectory } from "@athyper/product-neon-workforce";
import { NeonRouteEntitlement } from "@/lib/experience-runtime";

export const metadata: Metadata = { title: "Employees" };
export default function EmployeesPage(){return <NeonRouteEntitlement workspaceCode="ppl" moduleCode="hr"><EmployeeDirectory/></NeonRouteEntitlement>;}
