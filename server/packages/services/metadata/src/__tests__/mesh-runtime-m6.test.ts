import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../../..");

describe("Mesh published runtime M6 wiring", () => {
  it("derives catalog admission from the effective published Mesh artifact", () => {
    const route = source("server/packages/services/metadata/routes/mesh-runtime.route.ts");
    expect(route).toContain("loadPublishedRuntimeDescriptor");
    expect(route).toContain('plane: "mesh"');
    expect(route).toContain("hasAuthorizedSurface");
    expect(route).toContain("contract.runtime.capabilities.read === \"none\"");
    expect(route).toContain("surface.security.required_permissions.every");
  });

  it("revalidates account and record grants on every record boundary", () => {
    const route = source("server/packages/services/metadata/routes/mesh-runtime.route.ts");
    expect(route).toContain("FROM mesh.account_grant");
    expect(route).toContain("AND status='active'");
    expect(route).toContain("EXISTS (");
    expect(route).toContain("allow_grant.effect='allow'");
    expect(route).toContain("NOT EXISTS (");
    expect(route).toContain("deny_grant.effect='deny'");
    expect(route).toContain("surface.security.required_permissions.every");
    expect(route).toContain('message: "The requested resource was not found."');
  });

  it("projects and masks partner fields before returning Mesh records", () => {
    const route = source("server/packages/services/metadata/routes/mesh-runtime.route.ts");
    expect(route).toContain("isMeshFieldReadable");
    expect(route).toContain("contract.policy.field_security");
    expect(route).toContain("projectMeshRuntimeRow");
    expect(route).toContain("applyMeshFieldMask");
    expect(route).toContain('mask === "full"');
    expect(route).toContain('mask === "hash"');
  });

  it("uses runtime list/detail pages without static entity URL gates", () => {
    const list = source("apps/mesh/app/(shell)/app/[entity]/page.tsx");
    const detail = source("apps/mesh/app/(shell)/app/[entity]/[id]/page.tsx");
    const manifest = source("packages/shared/data-integration/route-manifest-core/src/index.ts");
    expect(list).toContain("<MeshListPage");
    expect(detail).toContain("<RuntimeDetailPage");
    expect(detail).toContain("<MeshDocumentObjectPageClient");
    expect(detail).toContain("resolveRuntimeObjectPageRenderer");
    expect(list + detail).not.toContain("isMeshVisibleEntity");
    expect(manifest).not.toContain("MESH_RUNTIME_ENTITY_POLICIES");
    expect(manifest).not.toContain("/app/document_envelope");
  });

  it("keeps Mesh generic create/write disabled and filters handler authority", () => {
    const adapter = source("packages/products/mesh/app/src/list/meshAdapter.ts");
    const bootstrap = source("server/packages/services/metadata/routes/runtime-bootstrap.route.ts");
    expect(adapter).toContain("bulkActions:         false");
    expect(adapter).toContain("import:              false");
    expect(adapter).toContain("Mesh never exposes generic direct create/write routes");
    expect(bootstrap).toContain("isMeshBootstrapOperationAllowed");
    expect(bootstrap).toContain('target.startsWith("/api/mesh/")');
    expect(bootstrap).toContain('target.startsWith("mesh:")');
  });

  it("builds shell entity navigation from the authorized catalog", () => {
    const layout = source("apps/mesh/app/(shell)/layout.tsx");
    const shell = source("packages/products/mesh/shell/src/index.tsx");
    expect(layout).toContain("getMeshRuntimeCatalog()");
    expect(shell).toMatch(/runtimeCatalog\s*\.filter\(\(item\) => item\.list\)/);
    expect(shell).toContain("href: `/app/${item.entityCode}`");
  });
});

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}
