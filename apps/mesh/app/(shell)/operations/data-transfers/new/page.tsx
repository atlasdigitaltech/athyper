"use client";
import { RecordImportWorkspace } from "@athyper/platform-entity-list-view";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

export default function NewDataTransferPage(){return <Suspense fallback={<p>Loading guided import…</p>}><NewDataTransfer/></Suspense>;}
function NewDataTransfer(){const query=useSearchParams();return <RecordImportWorkspace client={useApiClient()} entityCode={query.get("entity")??""} scopeCoordinate={scope(query)}/>;}
function scope(query:ReturnType<typeof useSearchParams>){const value={companyCodeId:query.get("companyCodeId")??undefined,legalEntityId:query.get("legalEntityId")??undefined,operatingOrganizationId:query.get("operatingOrganizationId")??undefined,networkAccountId:query.get("networkAccountId")??undefined};return Object.values(value).some(Boolean)?value:undefined;}
