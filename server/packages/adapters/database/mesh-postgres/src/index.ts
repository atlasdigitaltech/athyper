// @athyper/server-adapter-db-mesh — Mesh plane PostgreSQL adapter
// apps/mesh workspace:* dep will be rewired here during frontend wiring phase
export {
  createMeshDatabaseAdapter,
  type MeshDatabase,
  type MeshDatabaseAdapter,
  type MeshDatabaseAdapterConfig,
  type MeshActorProvider,
  type MeshTenantTransaction,
  type MeshSystemTransaction,
} from "./mesh-database-adapter.js";
