import { ApiError, encodePathSegment, type ApiFetch } from "../base";
import {
  type CompiledEntity,
  type CatalogEntity,
  type EntityOperation,
  type StatusRoute,
  type LookupDomainBundle,
  type EntityCapability,
  type FlowBundle,
} from "../types";

export function createMetadataClient(fetch: ApiFetch) {
  return {
    async getCompiledEntity(entityCode: string): Promise<CompiledEntity> {
      return fetch(`/api/metadata/entities/${encodePathSegment(entityCode)}/compiled`);
    },

    async getCatalogEntity(entityCode: string): Promise<CatalogEntity> {
      return fetch(`/api/metadata/catalog/${encodePathSegment(entityCode)}`);
    },

    async getEntityOperations(entityName: string): Promise<EntityOperation[]> {
      return fetch(`/api/metadata/entities/${encodePathSegment(entityName)}/operations`);
    },

    async getStatusRoute(entityName: string): Promise<StatusRoute> {
      return fetch(`/api/metadata/entities/${encodePathSegment(entityName)}/status-route`);
    },

    async getLookupDomainBundle(domainCode: string): Promise<LookupDomainBundle> {
      return fetch(`/api/metadata/lookups/${encodePathSegment(domainCode)}`);
    },

    async getHotSetLookups(): Promise<LookupDomainBundle[]> {
      return fetch(`/api/metadata/lookups/hot-set`);
    },

    async getEntityCapabilities(entityName: string): Promise<EntityCapability[]> {
      return fetch(`/api/metadata/entities/${encodePathSegment(entityName)}/capabilities`);
    },

    async getEntityFlow(
      entityCode: string,
      trigger:    string = "new",
      flowCode?:  string,
    ): Promise<FlowBundle | null> {
      try {
        const p = new URLSearchParams({ trigger });
        if (flowCode) p.set("flow_code", flowCode);
        return await fetch(
          `/api/metadata/entities/${encodePathSegment(entityCode)}/flow?${p}`,
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  };
}

export type MetadataClient = ReturnType<typeof createMetadataClient>;
