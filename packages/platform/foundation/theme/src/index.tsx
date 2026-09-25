import * as React from "react";
import type { ReactElement } from "react";
export * from "./tokens";
import { DEFAULT_THEME_FAMILY, DENSITY_MODES, DENSITY_STORAGE_KEY, isColorMode, THEME_FAMILIES, THEME_FAMILY_STORAGE_KEY, THEME_STORAGE_KEY, type ColorMode, type DensityMode, type ThemeFamily } from "./tokens";

export interface ThemeScriptProps {
  readonly sessionMode?: ColorMode;
  readonly tenantDefault?: ColorMode;
  readonly platformDefault?: ColorMode;
  readonly density?: DensityMode;
  readonly nonce?: string;
  readonly storageKey?: string;
  readonly densityStorageKey?: string;
  readonly themeFamily?: ThemeFamily;
  readonly familyStorageKey?: string;
}

export function createThemeBootstrapScript(input: Omit<ThemeScriptProps, "nonce"> = {}): string {
  const data = JSON.stringify({
    sessionMode: input.sessionMode,
    tenantDefault: input.tenantDefault,
    platformDefault: input.platformDefault,
    density: input.density ?? "comfortable",
    storageKey: input.storageKey ?? THEME_STORAGE_KEY,
    densityStorageKey: input.densityStorageKey ?? DENSITY_STORAGE_KEY,
    themeFamily: input.themeFamily ?? DEFAULT_THEME_FAMILY,
    familyStorageKey: input.familyStorageKey ?? THEME_FAMILY_STORAGE_KEY,
  }).replaceAll("<", "\\u003c");
  return `(()=>{const c=${data},d=document.documentElement,v=["light","dark","high-contrast"],ok=x=>v.includes(x),dv=${JSON.stringify(DENSITY_MODES)},okd=x=>dv.includes(x),fv=${JSON.stringify(THEME_FAMILIES)},okf=x=>fv.includes(x);let p=c.sessionMode;try{p=p||localStorage.getItem(c.storageKey)}catch{}let dp=c.density;try{const sd=localStorage.getItem(c.densityStorageKey);if(okd(sd))dp=sd}catch{}let fp=c.themeFamily;try{const sf=localStorage.getItem(c.familyStorageKey);if(okf(sf))fp=sf}catch{}const contrast=matchMedia("(forced-colors: active)").matches||matchMedia("(prefers-contrast: more)").matches;const dark=matchMedia("(prefers-color-scheme: dark)").matches;const m=ok(p)?p:ok(c.tenantDefault)?c.tenantDefault:ok(c.platformDefault)?c.platformDefault:contrast?"high-contrast":dark?"dark":"light";d.dataset.themeFamily=fp;d.dataset.theme=m;d.dataset.density=dp;d.style.colorScheme=m==="dark"||m==="high-contrast"?"dark":"light";})();`;
}

export function ThemeScript(props: ThemeScriptProps): ReactElement {
  if (props.sessionMode !== undefined && !isColorMode(props.sessionMode)) throw new TypeError("Invalid session theme mode");
  return <script data-athyper-theme-script="true" nonce={props.nonce} dangerouslySetInnerHTML={{ __html: createThemeBootstrapScript(props) }} />;
}
