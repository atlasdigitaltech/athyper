"use client";

import { resolveIcon } from "@athyper/platform-icons";
import * as React from "react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { canAccessRoute, deriveBreadcrumbs, type DerivedShellNavigation } from "./core";

export interface ShellContextOption { readonly tenantId: string; readonly label: string; }
export interface ShellChromeProps { readonly applicationName: string; readonly tenantLabel: string; readonly accountLabel: string; readonly accountSecondaryLabel?: string; readonly workContextControl?: ReactNode; readonly navigation: DerivedShellNavigation; readonly experienceState?: "ready" | "context_not_ready"; readonly contexts?: readonly ShellContextOption[]; readonly children: ReactNode; }
export function ShellChrome({ applicationName, tenantLabel, accountLabel, accountSecondaryLabel, workContextControl, navigation, experienceState = "ready", contexts, children }: ShellChromeProps) {
  const [drawerOpen, setDrawerOpen] = useState(false), [collapsed, setCollapsed] = useState(false), [path, setPath] = useState("/");
  const menuButton = useRef<HTMLButtonElement>(null), firstLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => { setPath(window.location.pathname); setCollapsed(localStorage.getItem("athyper.shell.collapsed") === "true"); }, []);
  useEffect(() => { if (!drawerOpen) return; firstLink.current?.focus(); const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setDrawerOpen(false); requestAnimationFrame(() => menuButton.current?.focus()); } }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [drawerOpen]);
  const toggleCollapsed = () => setCollapsed((value) => { localStorage.setItem("athyper.shell.collapsed", String(!value)); return !value; });
  const closeDrawer = () => { setDrawerOpen(false); requestAnimationFrame(() => menuButton.current?.focus()); };
  const crumbs = deriveBreadcrumbs(navigation, path);
  const systemRoute = path === "/select-context" || path.startsWith("/auth/"), routeAllowed = systemRoute || canAccessRoute(navigation, path);
  return <div className="athyper-shell" data-collapsed={collapsed} data-drawer-open={drawerOpen}>
    <a className="athyper-shell__skip" href="#main-content">Skip to main content</a>
    <header className="athyper-shell__topbar">
      <button ref={menuButton} className="athyper-shell__menu-button" type="button" aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="plane-navigation" onClick={() => setDrawerOpen(true)}>☰</button>
      <a className="athyper-shell__brand" href={navigation.landingHref ?? "/"}>{applicationName}</a>
      {workContextControl ? <div className="athyper-shell__work-context">{workContextControl}</div> : null}
      <div className="athyper-shell__reserved" aria-label="Reserved application actions"><span data-slot="search">Search</span><span data-slot="notifications">Notifications</span><span data-slot="inbox">Inbox</span><span data-slot="agent">Agent</span></div>
      <AccountMenu accountLabel={accountLabel} secondaryLabel={accountSecondaryLabel} tenantLabel={tenantLabel} />
    </header>
    {drawerOpen ? <button type="button" className="athyper-shell__scrim" aria-label="Close navigation" onClick={closeDrawer} /> : null}
    <aside id="plane-navigation" className="athyper-shell__rail" aria-label="Application navigation" aria-modal={drawerOpen || undefined}>
      <div className="athyper-shell__rail-head"><ContextSwitcher tenantLabel={tenantLabel} contexts={contexts} landingHref={navigation.landingHref} /><button className="athyper-shell__close" type="button" aria-label="Close navigation" onClick={closeDrawer}>×</button></div>
      <NavigationPanel navigation={navigation} path={path} firstLink={firstLink} onNavigate={closeDrawer} />
      <button className="athyper-shell__collapse" type="button" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-pressed={collapsed} onClick={toggleCollapsed}>{collapsed ? "›" : "‹ Collapse"}</button>
    </aside>
    <div className="athyper-shell__body">
      <nav className="athyper-shell__breadcrumbs" aria-label="Breadcrumb">{crumbs.length ? <ol>{crumbs.map((crumb, index) => <li key={`${crumb.label}-${index}`}>{crumb.href && index < crumbs.length - 1 ? <a href={crumb.href}>{crumb.label}</a> : <span aria-current={index === crumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>}</li>)}</ol> : null}</nav>
      <main id="main-content" tabIndex={-1} className="athyper-shell__main">{experienceState === "context_not_ready" ? <ContextNotReady /> : !navigation.routes.length ? <EmptyEntitlement /> : routeAllowed ? children : <ForbiddenRoute />}</main>
    </div>
  </div>;
}

function NavigationPanel({ navigation, path, firstLink, onNavigate }: { readonly navigation: DerivedShellNavigation; readonly path: string; readonly firstLink: React.RefObject<HTMLAnchorElement | null>; readonly onNavigate: () => void }) {
  let first = true;
  return <nav className="athyper-shell__navigation" aria-label="Workspaces and modules">{navigation.workspaces.map((workspace) => <section key={workspace.code} className="athyper-shell__workspace"><h2>{workspace.name}</h2><ul>{workspace.routes.filter((route) => route.navigation !== "hidden").map((route) => { const Icon = resolveIcon(route.iconKey), ref = first ? firstLink : undefined; first = false; return <li key={route.id}><a ref={ref} href={route.href} aria-current={path === route.href || (route.href !== "/" && path.startsWith(`${route.href}/`)) ? "page" : undefined} onClick={onNavigate}><Icon size={18} /><span>{route.label}</span></a></li>; })}</ul></section>)}</nav>;
}
function ContextSwitcher({ tenantLabel, contexts, landingHref }: { readonly tenantLabel: string; readonly contexts?: readonly ShellContextOption[]; readonly landingHref?: string }) {
  const [pending, setPending] = useState(false);
  if (!contexts || contexts.length < 2) return <a className="athyper-shell__context" href="/select-context"><span>Context</span><strong>{tenantLabel}</strong></a>;
  return <label className="athyper-shell__context"><span>Context</span><select aria-label="Tenant context" disabled={pending} defaultValue={contexts.find((item) => item.label === tenantLabel)?.tenantId ?? contexts[0]?.tenantId} onChange={(event) => { setPending(true); void switchShellContext(event.currentTarget.value, landingHref).catch(() => setPending(false)); }}>{contexts.map((item) => <option key={item.tenantId} value={item.tenantId}>{item.label}</option>)}</select></label>;
}
export async function switchShellContext(tenantId: string, returnTo = "/", fetcher: typeof fetch = fetch): Promise<void> { if (!tenantId.trim()) throw new TypeError("tenantId is required"); const csrf = readCookie("__Host-athyper-csrf") ?? readCookie("athyper-csrf"); const response = await fetcher("/api/auth/session/context", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: JSON.stringify({ tenantId }) }); if (!response.ok) throw new Error("Context switch failed"); window.location.assign(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/"); }
function readCookie(name: string): string | undefined { return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1); }
function AccountMenu({ accountLabel,secondaryLabel,tenantLabel }: { readonly accountLabel: string;readonly secondaryLabel?:string;readonly tenantLabel:string }) { return <details className="athyper-shell__account"><summary aria-label={`Open account menu for ${accountLabel}`}>{accountLabel}</summary><div><strong>{accountLabel}</strong>{secondaryLabel?<small>{secondaryLabel}</small>:null}<small>{tenantLabel}</small><a href="/select-context">Switch business context</a><a href="/logout">Sign out</a></div></details>; }
function EmptyEntitlement() { return <section className="athyper-shell__empty" aria-labelledby="empty-entitlement-title"><h1 id="empty-entitlement-title">No applications available</h1><p>Your current plan and access do not provide a permitted route. Contact an administrator or switch context.</p><a href="/select-context">Switch context</a></section>; }
function ContextNotReady() { return <section className="athyper-shell__empty" aria-labelledby="context-not-ready-title"><h1 id="context-not-ready-title">Business context is not ready</h1><p>This context does not have an active application plan. Ask an administrator to complete its setup, then try again.</p><a href="/select-context">Switch context</a></section>; }
function ForbiddenRoute() { return <section className="athyper-shell__empty" aria-labelledby="forbidden-route-title"><h1 id="forbidden-route-title">Access denied</h1><p>This route is not available in your current plan, permissions, or feature configuration.</p><a href="/">Go to an available application</a></section>; }
