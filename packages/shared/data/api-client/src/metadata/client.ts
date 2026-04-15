/**
 * @athyper/api-client — Metadata Client
 *
 * HTTP client for the metadata runtime read path.
 * Fetches compiled entities, operations, lifecycle routes, and lookups.
 */
import { type ApiFetch } from "../base";
import {
  type CompiledEntity,
  type EntityOperation,
  type StatusRoute,
  type LookupDomainBundle,
  type EntityCapability,
} from "@athyper/api-contracts/metadata";

export function createMetadataClient(fetch: ApiFetch) {
  return {
    /** Fetch compiled entity descriptor by entity code */
    async getCompiledEntity(entityCode: string): Promise<CompiledEntity> {
      return fetch(`/api/metadata/entities/${entityCode}/compiled`);
    },

    /** Fetch operations registered for an entity */
    async getEntityOperations(entityName: string): Promise<EntityOperation[]> {
      return fetch(`/api/metadata/entities/${entityName}/operations`);
    },

    /** Fetch compiled status route for an entity */
    async getStatusRoute(entityName: string): Promise<StatusRoute> {
      return fetch(`/api/metadata/entities/${entityName}/status-route`);
    },

    /** Fetch a single lookup domain with all active values */
    async getLookupDomainBundle(domainCode: string): Promise<LookupDomainBundle> {
      return fetch(`/api/metadata/lookups/${encodeURIComponent(domainCode)}`);
    },

    /** Fetch the hot set of high-frequency lookup domains */
    async getHotSetLookups(): Promise<LookupDomainBundle[]> {
      return fetch(`/api/metadata/lookups/hot-set`);
    },

    /** Fetch entity capabilities for the current tenant */
    async getEntityCapabilities(entityName: string): Promise<EntityCapability[]> {
      return fetch(`/api/metadata/entities/${entityName}/capabilities`);
    },
  };
}

export type MetadataClient = ReturnType<typeof createMetadataClient>;
