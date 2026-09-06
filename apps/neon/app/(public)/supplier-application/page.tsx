import type { Metadata } from "next";
import { SupplierApplicantExperience } from "@athyper/product-neon-business-partner";

export const metadata:Metadata={title:"Supplier application"};
export default async function SupplierApplicationPage({searchParams}:{readonly searchParams:Promise<{readonly requestId?:string}>}){return <SupplierApplicantExperience initialRequestId={(await searchParams).requestId}/>;}
