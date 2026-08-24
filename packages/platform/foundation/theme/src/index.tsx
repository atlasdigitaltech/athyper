import * as React from "react";
import type { ReactElement } from "react";
export * from "./tokens";
import { DEFAULT_THEME_FAMILY, isColorMode, type ColorMode, type DensityMode, type ThemeFamily } from "./tokens";

export interface ThemeScriptProps {
  readonly sessionMode?: ColorMode;
  readonly tenantDefault?: ColorMode;
  readonly platformDefault?: ColorMode;
  readonly density?: DensityMode;
  readonly nonce?: string;
  readonly storageKey?: string;
  readonly themeFamily?: ThemeFamily;
}

export function createThemeBootstrapScript(input: Omit<ThemeScriptProps, "nonce"> = {}): string {
  const data = JSON.stringify({
    sessionMode: input.sessionMode,
    tenantDefault: input.tenantDefault,
    platformDefault: input.platformDefault,
    density: input.density ?? "comfortable",
    storageKey: input.storageKey ?? "athyper.theme",
    themeFamily: input.themeFamily ?? DEFAULT_THEME_FAMILY,
  }).replaceAll("<", "\\u003c");
  return `(()=>{const c=${data},d=document.documentElement,v=["light","dark","high-contrast"],ok=x=>v.includes(x);let p=c.sessionMode;try{p=p||localStorage.getItem(c.storageKey)}catch{}const contrast=matchMedia("(forced-colors: active)").matches||matchMedia("(prefers-contrast: more)").matches;const dark=matchMedia("(prefers-color-scheme: dark)").matches;const m=ok(p)?p:ok(c.tenantDefault)?c.tenantDefault:ok(c.platformDefault)?c.platformDefault:contrast?"high-contrast":dark?"dark":"light";d.dataset.themeFamily=c.themeFamily;d.dataset.theme=m;d.dataset.density=c.density;d.style.colorScheme=m==="dark"?"dark":"light";})();`;
}

export function ThemeScript(props: ThemeScriptProps): ReactElement {
  if (props.sessionMode !== undefined && !isColorMode(props.sessionMode)) throw new TypeError("Invalid session theme mode");
  return <script data-athyper-theme-script="true" nonce={props.nonce} dangerouslySetInnerHTML={{ __html: createThemeBootstrapScript(props) }} />;
}
