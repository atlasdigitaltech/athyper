import type {Metadata} from "next";
import {SupplierWorkforceRequisitionList} from "@athyper/product-neon-workforce";
import {NeonRouteEntitlement} from "@/lib/experience-runtime";

export const metadata:Metadata={title:"Supplier Workforce requisitions"};
export default function SupplierWorkforceRequisitionsPage(){return <NeonRouteEntitlement workspaceCode="ppl" moduleCode="workforce"><SupplierWorkforceRequisitionList/></NeonRouteEntitlement>;}
