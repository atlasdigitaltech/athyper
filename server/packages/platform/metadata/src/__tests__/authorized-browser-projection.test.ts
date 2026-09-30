import { describe, expect, it } from "vitest";
import { projectAuthorizedBrowserSurface } from "../authorized-browser-projection.js";

const release: any = {
  coordinate: { entityCode: "business_partner" },
  release: { releaseId: "release", releaseHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
};

describe("authorized browser projection", () => {
  it("does not expose Core storage or policy internals and scopes the cache key", () => {
    const core: any = { artifactType: "core", content: { fields: [
      { key: "name", dataType: "string", nullable: false, label: { labelKey: "entity.business_partner.name", defaultText: "Name" }, binding: { sourceObject: "master.business_partner", column: "name" }, policyBindings: [{ evaluatorKey: "internal" }] },
      { key: "bank", dataType: "string", nullable: true, binding: { sourceObject: "master.bank_account", column: "account_number" } },
    ] } };
    const surface: any = { artifactType: "presentation_surface", content: { sections: [
      { sectionKey: "overview", load: "initial", label: { labelKey: "entity.business_partner.overview", defaultText: "Overview" } },
      { sectionKey: "banking", load: "visible" },
    ] } };
    const base = {
      release,
      core,
      surface,
      coordinate: { tenantId: "tenant", principalId: "user-a", accessEpoch: 4, contextKey: "company-a", locale: "en", surfaceKey: "detail" },
      allowedFieldKeys: new Set(["name"]),
      allowedSectionKeys: new Set(["overview"]),
    } as const;
    const first = projectAuthorizedBrowserSurface(base);
    const second = projectAuthorizedBrowserSurface({ ...base, coordinate: { ...base.coordinate, principalId: "user-b" } });
    expect(first.fields).toEqual([{ key: "name", dataType: "string", nullable: false, label: { labelKey: "entity.business_partner.name", defaultText: "Name" } }]);
    expect(JSON.stringify(first)).not.toContain("sourceObject");
    expect(JSON.stringify(first)).not.toContain("evaluatorKey");
    expect(first.sections.map((section) => section.key)).toEqual(["overview"]);
    expect(first.cacheKey).not.toEqual(second.cacheKey);
  });
});
