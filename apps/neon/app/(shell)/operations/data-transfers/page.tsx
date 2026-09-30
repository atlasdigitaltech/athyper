"use client";
import { RecordTransferWorkspace } from "@athyper/platform-entity-list-view";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
export default function DataTransfersPage(){return <RecordTransferWorkspace client={useApiClient()}/>;}
