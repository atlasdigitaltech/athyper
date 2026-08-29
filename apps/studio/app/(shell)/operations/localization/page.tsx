"use client";

import {
  localePolicyOperation,
  updateLocalePolicyOperation,
  type ExperienceLocaleCatalog,
  type ExperienceLocalePolicy,
  type LocaleCatalogStatus,
} from "@athyper/platform-api-client";
import { useApiClient, useHasPermission } from "@athyper/platform-shell-app-foundation";
import { ContentHeader } from "@athyper/platform-shell";
import type { SupportedLocale } from "@athyper/platform-i18n";
import { CheckIcon, CloseIcon, SearchIcon } from "@athyper/platform-icons";
import { useEffect, useMemo, useState } from "react";

const PLANES = ["studio", "neon", "mesh"] as const;
const STATUSES: readonly LocaleCatalogStatus[] = ["draft", "translating", "review", "qualified", "retired"];
type Plane = (typeof PLANES)[number];
type SaveState = "idle" | "saving" | "saved" | "error";
type PortfolioView = "all" | "active" | "qualified" | "attention" | "rtl";
const PAGE_SIZE = 15;

export default function LocalizationAdministrationPage() {
  const client = useApiClient();
  const authorized = useHasPermission("studio.platform.catalog.manage");
  const [policies, setPolicies] = useState<Partial<Record<Plane, ExperienceLocalePolicy>>>({});
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saveStates, setSaveStates] = useState<Partial<Record<Plane, SaveState>>>({});
  const [activePlane, setActivePlane] = useState<Plane>("studio");

  useEffect(() => {
    if (!authorized) { setLoadState("ready"); return; }
    const controller = new AbortController();
    Promise.all(PLANES.map((planeKey) => client.request(localePolicyOperation, { params: { planeKey }, signal: controller.signal })))
      .then((rows) => { setPolicies(Object.fromEntries(rows.map((row) => [row.planeKey, row]))); setLoadState("ready"); })
      .catch(() => { if (!controller.signal.aborted) setLoadState("error"); });
    return () => controller.abort();
  }, [authorized, client]);

  if (!authorized) return <StatePage message="Studio catalog-management permission is required." />;
  if (loadState === "loading") return <StatePage message="Loading governed plane catalogs…" busy />;
  if (loadState === "error") return <StatePage message="Plane locale policies could not be loaded." error />;

  const updatePolicy = (plane: Plane, transform: (policy: ExperienceLocalePolicy) => ExperienceLocalePolicy) => {
    setPolicies((current) => ({ ...current, [plane]: transform(current[plane]!) }));
    setSaveStates((current) => ({ ...current, [plane]: "idle" }));
  };

  const updateCatalog = (plane: Plane, localeCode: SupportedLocale, change: Partial<ExperienceLocaleCatalog>) => updatePolicy(plane, (policy) => {
    let catalogs = policy.catalogs.map((catalog) => catalog.localeCode === localeCode ? { ...catalog, ...change } : catalog);
    let enabledLocales = [...policy.enabledLocales];
    let defaultLocale = policy.defaultLocale;
    const changed = catalogs.find((catalog) => catalog.localeCode === localeCode)!;
    const gatesPass = catalogGatesPass(changed);
    if (changed.status === "qualified" && !gatesPass) {
      catalogs = catalogs.map((catalog) => catalog.localeCode === localeCode ? { ...catalog, status: "review" as const, qualified: false } : catalog);
    } else {
      catalogs = catalogs.map((catalog) => catalog.localeCode === localeCode ? { ...catalog, qualified: catalog.status === "qualified" && gatesPass } : catalog);
    }
    const effective = catalogs.find((catalog) => catalog.localeCode === localeCode)!;
    if (!effective.qualified || effective.status === "retired") {
      enabledLocales = enabledLocales.filter((locale) => locale === "en" || locale !== localeCode);
      if (defaultLocale === localeCode) defaultLocale = "en";
    }
    return { ...policy, catalogs: Object.freeze(catalogs), enabledLocales: Object.freeze(enabledLocales), defaultLocale };
  });

  const toggleActivation = (plane: Plane, localeCode: SupportedLocale, active: boolean) => updatePolicy(plane, (policy) => {
    const enabledLocales = active
      ? policy.catalogs.map((catalog) => catalog.localeCode).filter((code) => code === "en" || policy.enabledLocales.includes(code) || code === localeCode)
      : policy.enabledLocales.filter((code) => code !== localeCode);
    return { ...policy, enabledLocales: Object.freeze(enabledLocales), defaultLocale: !active && policy.defaultLocale === localeCode ? "en" : policy.defaultLocale };
  });

  const save = async (plane: Plane) => {
    const policy = policies[plane]; if (!policy) return;
    setSaveStates((current) => ({ ...current, [plane]: "saving" }));
    try {
      const saved = await client.request(updateLocalePolicyOperation, {
        params: { planeKey: plane },
        body: {
          catalogs: policy.catalogs.map(({ localeCode, status, coveragePct, linguisticReviewPassed, layoutReviewPassed, automatedTestsPassed }) => ({ localeCode, status, coveragePct, linguisticReviewPassed, layoutReviewPassed, automatedTestsPassed })),
          enabledLocales: policy.enabledLocales,
          defaultLocale: policy.defaultLocale,
          fallbackLocale: "en",
        },
        idempotencyKey: `locale-policy:${plane}:${crypto.randomUUID()}`,
      });
      setPolicies((current) => ({ ...current, [plane]: saved }));
      setSaveStates((current) => ({ ...current, [plane]: "saved" }));
    } catch {
      setSaveStates((current) => ({ ...current, [plane]: "error" }));
    }
  };

  return (
    <section className="studio-localization" aria-labelledby="localization-title">
      <ContentHeader
        title="Languages and regions"
        titleId="localization-title"
        description="Govern catalog readiness and activation independently for each plane. English remains the non-removable emergency fallback."
      />
      <div className="studio-localization__legend" aria-label="Qualification requirements">
        <strong>Qualification requires</strong>{["100% coverage", "Linguistic review", "RTL/layout review", "Automated tests"].map((requirement) => <span key={requirement}><CheckIcon size={14}/>{requirement}</span>)}
      </div>
      <nav className="studio-localization__plane-tabs" aria-label="Plane locale policies">
        {PLANES.map((plane) => <button key={plane} type="button" aria-pressed={activePlane === plane} onClick={() => setActivePlane(plane)}><span>{title(plane)}</span><small>{policies[plane]?.enabledLocales.length ?? 0} active</small></button>)}
      </nav>
      {policies[activePlane] ? <LanguagePortfolio
        key={activePlane}
        plane={activePlane}
        policy={policies[activePlane]!}
        saveState={saveStates[activePlane] ?? "idle"}
        onCatalogChange={(locale, change) => updateCatalog(activePlane, locale, change)}
        onActivationChange={(locale, active) => toggleActivation(activePlane, locale, active)}
        onDefaultChange={(locale) => updatePolicy(activePlane, (policy) => ({ ...policy, defaultLocale: locale }))}
        onSave={() => void save(activePlane)}
      /> : null}
    </section>
  );
}

function LanguagePortfolio({ plane, policy, saveState, onCatalogChange, onActivationChange, onDefaultChange, onSave }: {
  readonly plane: Plane;
  readonly policy: ExperienceLocalePolicy;
  readonly saveState: SaveState;
  readonly onCatalogChange: (locale: SupportedLocale, change: Partial<ExperienceLocaleCatalog>) => void;
  readonly onActivationChange: (locale: SupportedLocale, active: boolean) => void;
  readonly onDefaultChange: (locale: SupportedLocale) => void;
  readonly onSave: () => void;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PortfolioView>("all");
  const [page, setPage] = useState(1);
  const [selectedLocale, setSelectedLocale] = useState<SupportedLocale>();
  const [selectedLocales, setSelectedLocales] = useState<readonly SupportedLocale[]>([]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => policy.catalogs.filter((catalog) => {
    const matchesQuery = !normalizedQuery || [catalog.nativeName, catalog.englishName, catalog.localeCode].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    const matchesView = view === "all"
      || (view === "active" && policy.enabledLocales.includes(catalog.localeCode))
      || (view === "qualified" && catalog.qualified)
      || (view === "attention" && !catalog.qualified && catalog.status !== "retired")
      || (view === "rtl" && catalog.direction === "rtl");
    return matchesQuery && matchesView;
  }), [normalizedQuery, policy.catalogs, policy.enabledLocales, view]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = selectedLocale ? policy.catalogs.find((catalog) => catalog.localeCode === selectedLocale) : undefined;
  const activeCount = policy.enabledLocales.length;
  const qualifiedCount = policy.catalogs.filter((catalog) => catalog.qualified).length;
  const attentionCount = policy.catalogs.filter((catalog) => !catalog.qualified && catalog.status !== "retired").length;

  useEffect(() => {
    if (!selectedLocale) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedLocale(undefined); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedLocale]);

  const chooseView = (next: PortfolioView) => { setView(next); setPage(1); setSelectedLocales([]); };
  const changeQuery = (next: string) => { setQuery(next); setPage(1); setSelectedLocales([]); };
  const toggleSelection = (locale: SupportedLocale, checked: boolean) => setSelectedLocales((current) => checked ? [...current, locale] : current.filter((value) => value !== locale));
  const visibleSelectable: readonly SupportedLocale[] = visible.map((catalog) => catalog.localeCode).filter((locale) => locale !== "en");
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((locale) => selectedLocales.includes(locale));

  return (
    <article className="studio-localization__portfolio">
      <header className="studio-localization__portfolio-summary">
        <div><p>Plane policy</p><h2>{title(plane)}</h2><small>{policy.catalogs.length} registered languages · revision {formatRevision(policy.revision)}</small></div>
        <dl><Summary label="Active" value={activeCount}/><Summary label="Qualified" value={qualifiedCount}/><Summary label="Attention" value={attentionCount} tone={attentionCount ? "warning" : "success"}/><Summary label="Default" value={policy.defaultLocale.toUpperCase()}/></dl>
      </header>
      <div className="studio-localization__toolbar">
        <label className="studio-localization__search"><span className="a-visually-hidden">Search languages</span><SearchIcon size={16}/><input type="search" value={query} placeholder="Search language or locale code" onChange={(event) => changeQuery(event.currentTarget.value)}/></label>
        <div className="studio-localization__views" aria-label="Language portfolio views">{(["all","active","qualified","attention","rtl"] as const).map((value) => <button key={value} type="button" aria-pressed={view === value} onClick={() => chooseView(value)}>{viewLabel(value)}<small>{viewCount(value, policy)}</small></button>)}</div>
      </div>
      {selectedLocales.length ? <div className="studio-localization__bulk" role="region" aria-label="Bulk language actions"><strong>{selectedLocales.length} selected</strong><button type="button" onClick={() => selectedLocales.forEach((locale) => { const catalog = policy.catalogs.find((item) => item.localeCode === locale); if (catalog?.qualified) onActivationChange(locale, true); })}>Activate qualified</button><button type="button" onClick={() => selectedLocales.forEach((locale) => onActivationChange(locale, false))}>Deactivate</button><button type="button" onClick={() => setSelectedLocales([])}>Clear selection</button></div> : null}
      <div className="studio-localization__portfolio-table-wrap">
        <table className="studio-localization__portfolio-table">
          <thead><tr><th className="studio-localization__select"><input type="checkbox" aria-label="Select visible languages" checked={allVisibleSelected} disabled={!visibleSelectable.length} onChange={(event) => setSelectedLocales(event.currentTarget.checked ? [...new Set([...selectedLocales, ...visibleSelectable])] : selectedLocales.filter((locale) => !visibleSelectable.includes(locale)))}/></th><th>Language</th><th>Rollout</th><th>Readiness</th><th>Blockers</th><th>Plane use</th><th><span className="a-visually-hidden">Manage</span></th></tr></thead>
          <tbody>{visible.map((catalog) => {
            const active = policy.enabledLocales.includes(catalog.localeCode);
            const catalogBlockers = blockers(catalog);
            return <tr key={catalog.localeCode}>
              <td className="studio-localization__select"><input type="checkbox" aria-label={`Select ${catalog.englishName}`} checked={selectedLocales.includes(catalog.localeCode)} disabled={catalog.localeCode === "en"} onChange={(event) => toggleSelection(catalog.localeCode, event.currentTarget.checked)}/></td>
              <th scope="row"><span className="studio-localization__language-mark" data-direction={catalog.direction}>{catalog.localeCode.toUpperCase()}</span><span><strong lang={catalog.localeCode}>{catalog.nativeName}</strong><small>{catalog.englishName} · {catalog.direction.toUpperCase()}</small></span></th>
              <td><span className={`studio-localization__wave studio-localization__wave--${catalog.rolloutWave}`}>{catalog.rolloutWave === 0 ? "Base" : `Wave ${catalog.rolloutWave}`}</span><small>{title(catalog.status)}</small></td>
              <td><div className="studio-localization__readiness"><span><strong>{catalog.coveragePct}%</strong><em className={catalog.qualified ? "studio-localization__qualified" : "studio-localization__pending"}>{catalog.qualified ? "Qualified" : "In progress"}</em></span><progress max="100" value={catalog.coveragePct}>{catalog.coveragePct}%</progress></div></td>
              <td>{catalogBlockers.length ? <div className="studio-localization__blockers">{catalogBlockers.slice(0,2).map((item) => <span key={item}>{item}</span>)}{catalogBlockers.length > 2 ? <small>+{catalogBlockers.length - 2} more</small> : null}</div> : <span className="studio-localization__clear"><CheckIcon size={14}/>Ready</span>}</td>
              <td><label className="studio-localization__activation"><input type="checkbox" checked={active} disabled={catalog.localeCode === "en" || !catalog.qualified} onChange={(event) => onActivationChange(catalog.localeCode, event.currentTarget.checked)}/><span>{active ? policy.defaultLocale === catalog.localeCode ? "Default" : "Active" : "Inactive"}</span></label></td>
              <td><button className="studio-localization__manage" type="button" onClick={() => setSelectedLocale(catalog.localeCode)} aria-label={`Manage ${catalog.englishName}`}>Manage</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!visible.length ? <div className="studio-localization__empty"><strong>No languages match this view</strong><p>Change the search or select another portfolio view.</p><button type="button" onClick={() => { changeQuery(""); chooseView("all"); }}>Clear filters</button></div> : null}
      <footer className="studio-localization__portfolio-footer">
        <span>Showing {filtered.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
        <nav aria-label="Language pages"><button type="button" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><span>Page {safePage} of {pageCount}</span><button type="button" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button></nav>
        <label>Default<select value={policy.defaultLocale} onChange={(event) => onDefaultChange(event.currentTarget.value as SupportedLocale)}>{policy.catalogs.filter((catalog) => policy.enabledLocales.includes(catalog.localeCode)).map((catalog) => <option key={catalog.localeCode} value={catalog.localeCode}>{catalog.nativeName} — {catalog.englishName}</option>)}</select></label>
        <span className={`studio-localization__save-state studio-localization__save-state--${saveState}`} role="status">{saveState === "saved" ? "Policy saved" : saveState === "error" ? "Policy could not be saved" : ""}</span>
        <button type="button" disabled={saveState === "saving"} onClick={onSave}>{saveState === "saving" ? "Saving…" : "Save plane policy"}</button>
      </footer>
      {selected ? <CatalogDrawer catalog={selected} plane={plane} active={policy.enabledLocales.includes(selected.localeCode)} isDefault={policy.defaultLocale === selected.localeCode} onChange={(change) => onCatalogChange(selected.localeCode, change)} onActivationChange={(active) => onActivationChange(selected.localeCode, active)} onDefault={() => onDefaultChange(selected.localeCode)} onClose={() => setSelectedLocale(undefined)}/> : null}
    </article>
  );
}

function CatalogDrawer({ catalog, plane, active, isDefault, onChange, onActivationChange, onDefault, onClose }: { readonly catalog: ExperienceLocaleCatalog; readonly plane: Plane; readonly active: boolean; readonly isDefault: boolean; readonly onChange: (change: Partial<ExperienceLocaleCatalog>) => void; readonly onActivationChange: (active: boolean) => void; readonly onDefault: () => void; readonly onClose: () => void }) {
  const english = catalog.localeCode === "en";
  const gatesPass = catalogGatesPass(catalog);
  return <div className="studio-localization__drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="studio-localization__drawer" role="dialog" aria-modal="true" aria-labelledby="catalog-drawer-title">
    <header><div><span className="studio-localization__language-mark" data-direction={catalog.direction}>{catalog.localeCode.toUpperCase()}</span><span><small>{title(plane)} catalog</small><h2 id="catalog-drawer-title" lang={catalog.localeCode}>{catalog.nativeName}</h2><p>{catalog.englishName} · {catalog.direction.toUpperCase()} · {catalog.rolloutWave === 0 ? "Base" : `Wave ${catalog.rolloutWave}`}</p></span></div><button type="button" autoFocus onClick={onClose} aria-label="Close language details"><CloseIcon/></button></header>
    <div className="studio-localization__drawer-status"><span className={catalog.qualified ? "studio-localization__qualified" : "studio-localization__pending"}>{catalog.qualified ? "Qualified" : "Qualification required"}</span><strong>{catalog.coveragePct}% complete</strong></div>
    <div className="studio-localization__drawer-form">
      <label>Catalog status<select value={catalog.status} disabled={english} onChange={(event) => onChange({ status: event.currentTarget.value as LocaleCatalogStatus })}>{STATUSES.map((status) => <option key={status} value={status} disabled={status === "qualified" && !gatesPass}>{title(status)}</option>)}</select></label>
      <label>Translation coverage<span className="studio-localization__coverage"><input aria-label={`${catalog.englishName} coverage percentage`} type="number" min="0" max="100" step="1" value={catalog.coveragePct} disabled={english} onChange={(event) => onChange({ coveragePct: Math.max(0, Math.min(100, event.currentTarget.valueAsNumber || 0)) })}/><span>%</span></span></label>
      <fieldset><legend>Qualification evidence</legend><Gate label="Linguistic review" checked={catalog.linguisticReviewPassed} disabled={english} onChange={(checked) => onChange({ linguisticReviewPassed: checked })}/><Gate label="Layout and RTL review" checked={catalog.layoutReviewPassed} disabled={english} onChange={(checked) => onChange({ layoutReviewPassed: checked })}/><Gate label="Automated tests" checked={catalog.automatedTestsPassed} disabled={english} onChange={(checked) => onChange({ automatedTestsPassed: checked })}/></fieldset>
      <fieldset><legend>Plane use</legend><Gate label={`Active for ${title(plane)}`} checked={active} disabled={english || !catalog.qualified} onChange={onActivationChange}/><button type="button" disabled={!active || isDefault} onClick={onDefault}>{isDefault ? "Current default language" : `Make default for ${title(plane)}`}</button></fieldset>
    </div>
    {!gatesPass ? <div className="studio-localization__drawer-blockers"><strong>Qualification blockers</strong><ul>{blockers(catalog).map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
    <footer><span>Changes remain local until the plane policy is saved.</span><button type="button" onClick={onClose}>Done</button></footer>
  </aside></div>;
}

function Summary({ label, value, tone }: { readonly label: string; readonly value: string | number; readonly tone?: "warning" | "success" }) { return <div data-tone={tone}><dt>{label}</dt><dd>{value}</dd></div>; }

function Gate({ label, checked, disabled, onChange }: { readonly label: string; readonly checked: boolean; readonly disabled: boolean; readonly onChange: (checked: boolean) => void }) {
  return <label title={label}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)}/><span>{label}</span></label>;
}

function StatePage({ message, busy, error }: { readonly message: string; readonly busy?: boolean; readonly error?: boolean }) {
  return <section className="studio-localization" aria-labelledby="localization-title" aria-busy={busy}><ContentHeader title="Languages and regions" titleId="localization-title" description={<span role={error ? "alert" : undefined}>{message}</span>}/></section>;
}

function catalogGatesPass(catalog: Pick<ExperienceLocaleCatalog,"coveragePct"|"linguisticReviewPassed"|"layoutReviewPassed"|"automatedTestsPassed">): boolean {
  return catalog.coveragePct === 100 && catalog.linguisticReviewPassed && catalog.layoutReviewPassed && catalog.automatedTestsPassed;
}

function blockers(catalog: ExperienceLocaleCatalog): string[] {
  const result: string[] = [];
  if (catalog.coveragePct < 100) result.push(`Coverage ${catalog.coveragePct}%`);
  if (!catalog.linguisticReviewPassed) result.push("Linguistic review");
  if (!catalog.layoutReviewPassed) result.push("Layout/RTL review");
  if (!catalog.automatedTestsPassed) result.push("Automated tests");
  if (catalog.status !== "qualified" && !result.length) result.push(`Status: ${title(catalog.status)}`);
  return result;
}

function viewLabel(view: PortfolioView): string { return view === "rtl" ? "RTL" : title(view); }

function viewCount(view: PortfolioView, policy: ExperienceLocalePolicy): number {
  if (view === "active") return policy.enabledLocales.length;
  if (view === "qualified") return policy.catalogs.filter((catalog) => catalog.qualified).length;
  if (view === "attention") return policy.catalogs.filter((catalog) => !catalog.qualified && catalog.status !== "retired").length;
  if (view === "rtl") return policy.catalogs.filter((catalog) => catalog.direction === "rtl").length;
  return policy.catalogs.length;
}

function formatRevision(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function title(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " "); }
