/**
 * @athyper/api-client — Metadata Client
 *
 * HTTP client for the metadata runtime read path.
 * Fetches compiled entities, operations, lifecycle routes, and lookups.
 */
import { ApiError, encodePathSegment, type ApiFetch } from "../base";
import {
  type CompiledEntity,
  type CatalogEntity,
  type EntityOperation,
  type StatusRoute,
  type LookupDomainBundle,
  type EntityCapability,
} from "@athyper/api-contracts/metadata";
import { type FlowBundle } from "@athyper/api-contracts/documents";

export function createMetadataClient(fetch: ApiFetch) {
  return {
    /** Fetch compiled entity descriptor by entity code */
    async getCompiledEntity(entityCode: string): Promise<CompiledEntity> {
      return fetch(`/api/metadata/entities/${encodePathSegment(entityCode)}/compiled`);
    },

    /** Fetch catalog metadata for any registered entity, including non-runtime entities. */
    async getCatalogEntity(entityCode: string): Promise<CatalogEntity> {
      return fetch(`/api/metadata/catalog/${encodePathSegment(entityCode)}`);
    },

    /** Fetch operations registered for an entity */
    async getEntityOperations(entityName: string): Promise<EntityOperation[]> {
      return fetch(`/api/metadata/entities/${encodePathSegment(entityName)}/operations`);
    },

    /** Fetch compiled status route for an entity */
    async getStatusRoute(entityName: string): Promise<StatusRoute> {
      return fetch(`/api/metadata/entities/${encodePathSegment(entityName)}/status-route`);
    },

    /** Fetch a single lookup domain with all active values */
    async getLookupDomainBundle(domainCode: string): Promise<LookupDomainBundle> {
      return fetch(`/api/metadata/lookups/${encodePathSegment(domainCode)}`);
    },

    /** Fetch the hot set of high-frequency lookup domains */
    async getHotSetLookups(): Promise<LookupDomainBundle[]> {
      return fetch(`/api/metadata/lookups/hot-set`);
    },

    /** Fetch entity capabilities for the current tenant */
    async getEntityCapabilities(entityName: string): Promise<EntityCapability[]> {
      return fetch(`/api/metadata/entities/${encodePathSegment(entityName)}/capabilities`);
    },

    /** Fetch an intake flow bundle for an entity.
     *  Pass `flowCode` to fetch a specific non-default flow (e.g. create_proforma).
     *  Omit `flowCode` to receive the default flow for the given trigger context. */
    async getEntityFlow(
      entityCode: string,
      trigger: string = "new",
      flowCode?: string,
    ): Promise<FlowBundle | null> {
      try {
        const params = new URLSearchParams({ trigger });
        if (flowCode) params.set("flow_code", flowCode);
        return await fetch(
          `/api/metadata/entities/${encodePathSegment(entityCode)}/flow?${params.toString()}`,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}

export type MetadataClient = ReturnType<typeof createMetadataClient>;
