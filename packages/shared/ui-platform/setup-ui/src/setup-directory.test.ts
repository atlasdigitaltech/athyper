import { describe, expect, it } from "vitest";
import type { SetupDestination } from "./setup-directory";
import { resolveSetupEntry } from "./setup-directory";

const destination = (plane: "admin" | "neon" | "mesh"): SetupDestination => ({
  id: `${plane}-1`, plane, workspaceCode: "workspace", domainCode: "domain",
  label: "Destination", href: "/setup/domain", requiredPermissions: [], requiredModules: [],
});

describe("resolveSetupEntry", () => {
  it("returns unavailable for no authorized destinations", () => expect(resolveSetupEntry([], "neon").kind).toBe("unavailable"));
  it("returns a same-plane redirect for one destination", () => expect(resolveSetupEntry([destination("neon")], "neon").kind).toBe("redirect"));
  it("requires a handoff for one cross-plane destination", () => expect(resolveSetupEntry([destination("admin")], "neon").kind).toBe("handoff"));
  it("keeps multiple destinations in the directory", () => expect(resolveSetupEntry([destination("neon"), destination("mesh")], "neon").kind).toBe("directory"));
});
