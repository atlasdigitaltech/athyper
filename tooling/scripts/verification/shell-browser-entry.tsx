import React from "react";
import { Dialog, DialogTrigger, DialogContent, DialogClose, Menu, MenuTrigger, MenuContent, MenuItem } from "../../../packages/platform/foundation/ui/src/index";
import { createRoot } from "react-dom/client";
import { PlatformShell } from "../../../packages/platform/shell/shell/src/index";
import { ShellChrome } from "../../../packages/platform/shell/shell/src/client";
import type { DerivedShellNavigation } from "../../../packages/platform/shell/shell/src/core";
const params = new URLSearchParams(location.search), empty = params.has("empty"), multi = params.has("multi"), desktopBrand = params.has("desktopBrand");
const route = Object.freeze({ id: "fixture.home", moduleCode: "acc", href: "/" as const, label: "General Ledger", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" as const, workspaceCode: "fin", workspaceName: "Finance", moduleName: "General Ledger", sortOrder: 1 });
const navigation: DerivedShellNavigation = Object.freeze({ workspaces: empty ? [] : [Object.freeze({ code: "fin", name: "Finance", href: "/", iconKey: "home", sortOrder: 1, routes: [route] })], routes: empty ? [] : [route], ...(empty ? {} : { landingHref: "/" }), unknownActiveModules: [] });
function ModalAuditContent() {
  return <Dialog><DialogTrigger>Open audit dialog</DialogTrigger>
    <DialogContent title="Outer audit dialog">
      <button disabled>Unavailable action</button><button hidden>Hidden action</button>
      <Menu><MenuTrigger>Audit menu</MenuTrigger><MenuContent portal><MenuItem>Portal action</MenuItem></MenuContent></Menu>
      <Dialog><DialogTrigger>Open nested audit dialog</DialogTrigger><DialogContent title="Nested audit dialog"><input aria-label="Nested input" /><DialogClose>Close nested dialog</DialogClose></DialogContent></Dialog>
      <Dialog><DialogTrigger>Open empty audit dialog</DialogTrigger><DialogContent title="Empty audit dialog"><button hidden>Hidden action</button><button disabled>Disabled action</button></DialogContent></Dialog>
      <DialogClose>Close outer dialog</DialogClose>
    </DialogContent>
  </Dialog>;
}
const FixtureShell = params.has("atlas") ? PlatformShell : ShellChrome;
createRoot(document.getElementById("root")!).render(<FixtureShell principalId="fixture-user" applicationName={params.get("plane") ?? "Athyper Test"} persistentDesktopBrand={desktopBrand} tenantId="tenant-alpha" tenantLabel="Tenant Alpha" tenantSecondaryLabel="ALPHA" accountLabel="User One" accountInitials="UO" accountLoginId="user.one" accountEmail="user.one@example.test" transactionContext={{ label: "Working company", value: "Company 1000", secondaryLabel: "Example company", changeable: false }} navigation={navigation} activity={params.has("zero") ? { notifications: [], inbox: [], openInboxCount: 0, unreadNotificationCount: 0 } : undefined} contexts={multi ? [{ tenantId: "tenant-alpha", label: "Tenant Alpha" }, { tenantId: "tenant-beta", label: "Tenant Beta" }] : undefined}><section><h1>Dashboard</h1><button type="button">Page action</button>{params.has("modals") ? <ModalAuditContent /> : null}</section></FixtureShell>);
