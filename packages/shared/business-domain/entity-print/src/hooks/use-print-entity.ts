"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

export interface PrintProfile {
  id: string;
  name: string;
  paper_size: string;
  orientation: string;
  margins: string;
  header_footer: boolean;
  background_graphics: boolean;
  is_default: boolean;
}

interface ProfilesResponse {
  data: PrintProfile[];
}

export interface EntityPrintRenderRequest {
  entityCode: string;
  recordId: string;
  profileId?: string;
}

export interface EntityPrintClient {
  listProfiles(signal?: AbortSignal): Promise<PrintProfile[]>;
  renderPdf(request: EntityPrintRenderRequest): Promise<Blob>;
}

export interface UsePrintEntityOptions {
  client?: EntityPrintClient;
  profilesQueryKey?: readonly unknown[];
}

export interface DocServicesPrintClientOptions {
  basePath?: string;
  readCsrfToken?: () => string;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export function createDocServicesPrintClient({
  basePath = "/api/docservices",
  readCsrfToken: readToken = readCsrfToken,
}: DocServicesPrintClientOptions = {}): EntityPrintClient {
  const normalizedBase = basePath.replace(/\/$/, "");

  return {
    async listProfiles(signal?: AbortSignal) {
      const res = await fetch(`${normalizedBase}/profiles?status=active`, { signal });
      if (!res.ok) throw new Error("Failed to load print profiles");
      const body = await res.json() as ProfilesResponse;
      return body.data;
    },
    async renderPdf({ entityCode, recordId, profileId }) {
      const res = await fetch(`${normalizedBase}/entity-print/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": readToken(),
        },
        body: JSON.stringify({
          entity_code: entityCode,
          record_id: recordId,
          profile_id: profileId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Render failed" })) as { message?: string };
        throw new Error(err.message ?? `Server error ${res.status}`);
      }

      return res.blob();
    },
  };
}

const defaultPrintClient = createDocServicesPrintClient();

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function usePrintEntity(
  entityCode: string,
  recordId: string,
  options: UsePrintEntityOptions = {},
) {
  const client = options.client ?? defaultPrintClient;
  const [selectedProfileId, setSelectedProfile] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data: profilesData } = useQuery<PrintProfile[]>({
    queryKey: options.profilesQueryKey ?? ["docservices", "profiles"],
    queryFn: ({ signal }) => client.listProfiles(signal),
    staleTime: 5 * 60 * 1000,
  });

  const profiles = profilesData ?? [];
  const defaultProfile = profiles.find((p) => p.is_default) ?? profiles[0] ?? null;
  const effectiveProfile = profiles.find((p) => p.id === selectedProfileId) ?? defaultProfile;

  const downloadPdf = useCallback(async () => {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      const blob = await client.renderPdf({
        entityCode,
        recordId,
        profileId: effectiveProfile?.id ?? undefined,
      });
      downloadBlob(blob, `${entityCode}-${recordId}.pdf`);
    } catch (err) {
      setDownloadError((err as Error).message ?? "Download failed");
    } finally {
      setIsDownloading(false);
    }
  }, [client, entityCode, recordId, effectiveProfile]);

  const clearError = useCallback(() => setDownloadError(null), []);

  return {
    profiles,
    effectiveProfile,
    setSelectedProfile,
    downloadPdf,
    isDownloading,
    downloadError,
    clearError,
  };
}
