import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SurfaceHeader } from "@athyper/platform-surface-kit";
import { MeUIProvider, ProfileSection } from "@athyper/me-ui";

describe("SurfaceHeader contract", () => {
  it("renders workspace identity, context, actions, and active navigation", () => {
    const html = renderToStaticMarkup(
      <SurfaceHeader
        kind="workspace"
        back={{ label: "Setup overview", href: "/finance/setup/company/TKSA" }}
        eyebrow="Finance Setup"
        title="Technostat Group HQ (TKSA)"
        facts={[{ key: "period", label: "Period:", value: "FY2026 · P07" }]}
        actions={<button type="button">Change company</button>}
        navigation={[
          { key: "overview", label: "Overview", href: "/finance/setup/company/TKSA" },
          {
            key: "foundation",
            label: "Foundation",
            href: "/finance/setup/company/TKSA/foundation",
            active: true,
          },
        ]}
      />,
    );

    expect(html).toContain('data-surface-header-kind="workspace"');
    expect(html).toContain("Technostat Group HQ (TKSA)");
    expect(html).toContain("FY2026 · P07");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Change company");
  });

  it("renders Settings as a selected-principal record surface", () => {
    const html = renderToStaticMarkup(
      <SurfaceHeader
        kind="record"
        eyebrow="Settings"
        title="ATHQ Admin"
        subtitle="athq.admin@athyper.demo"
        leadingVariant="plain"
        leading={<span>AA</span>}
        status={<span>Active</span>}
        facts={[
          { key: "tenant", label: "Tenant:", value: "le-athq" },
          { key: "workspace", label: "Workspace:", value: "user" },
        ]}
        navigation={[
          { key: "profile", label: "Profile", href: "/settings?section=profile", active: true },
          { key: "identity", label: "Identity & Access", href: "/settings?section=identity" },
        ]}
      />,
    );

    expect(html).toContain('data-surface-header-kind="record"');
    expect(html).toContain("Settings");
    expect(html).toContain("ATHQ Admin");
    expect(html).toContain("athq.admin@athyper.demo");
    expect(html).toContain("le-athq");
    expect(html).toContain("Identity &amp; Access");
    expect(html).toContain('aria-current="page"');
  });

  it("can omit the duplicate profile summary when identity is owned by the page header", () => {
    const html = renderToStaticMarkup(
      <MeUIProvider
        bffFetch={async <T,>() => ({} as T)}
        session={{
          displayName: "ATHQ Admin",
          email: "athq.admin@athyper.demo",
          activeOrg: "athyper--le-athq",
          activeWorkbench: "user",
        }}
      >
        <ProfileSection active={false} showSummary={false} />
      </MeUIProvider>,
    );

    expect(html).toContain("Account Identity");
    expect(html).not.toContain("ATHQ Admin");
    expect(html).not.toContain("h-14 w-14");
  });
});
