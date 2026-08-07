import { describe, expect, it } from "vitest";
import {
  atlasSessionScopeKey,
  createAtlasSessionScope,
} from "../../index";

function session(overrides: Record<string, unknown> = {}) {
  return {
    userId: "principal-1",
    planeKey: "neon",
    activeOrg: "org-1",
    authEpoch: 4,
    organizations: {
      "org-1": {
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        scopeVersion: 7,
        authEpoch: 3,
      },
    },
    ...overrides,
  };
}

describe("Atlas session scope", () => {
  it("captures the session and membership authentication epochs", () => {
    expect(createAtlasSessionScope(session())).toMatchObject({
      userId: "principal-1",
      tenantId: "tenant-1",
      plane: "neon",
      authEpoch: "4:3",
      permissionStamp: "7",
    });
  });

  it.each([
    ["principal", { userId: "principal-2" }],
    ["tenant", {
      activeOrg: "org-2",
      organizations: {
        "org-2": {
          tenantId: "tenant-2",
          workspaceId: "workspace-2",
          scopeVersion: 7,
          authEpoch: 3,
        },
      },
    }],
    ["plane", { planeKey: "mesh" }],
    ["session authentication epoch", { authEpoch: 5 }],
    ["membership authentication epoch", {
      organizations: {
        "org-1": {
          tenantId: "tenant-1",
          workspaceId: "workspace-1",
          scopeVersion: 7,
          authEpoch: 4,
        },
      },
    }],
  ])("changes identity when the %s changes", (_label, overrides) => {
    const original = atlasSessionScopeKey(createAtlasSessionScope(session()));
    const changed = atlasSessionScopeKey(
      createAtlasSessionScope(session(overrides)),
    );
    expect(changed).not.toBe(original);
  });

  it("does not collapse delimiter-ambiguous scope tuples", () => {
    const common = {
      plane: "neon" as const,
      authEpoch: "1",
      permissionStamp: "2",
    };

    expect(atlasSessionScopeKey({
      ...common,
      userId: "principal|tenant",
      tenantId: "workspace",
    })).not.toBe(atlasSessionScopeKey({
      ...common,
      userId: "principal",
      tenantId: "tenant|workspace",
    }));
  });
});
