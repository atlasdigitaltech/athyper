import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

/** The real stylesheet graph a plane application loads, in the order its root
 * layout imports it, with nested `@import`s inlined once. */
export function planeStyles(
  plane: "neon" | "mesh" | "studio" = "neon",
): string {
  const layout = resolve(`apps/${plane}/app/layout.tsx`);
  const imports = [
    ...readFileSync(layout, "utf8").matchAll(/import "([^"]+\.css)"/g),
  ].map((match) => match[1]!);
  const seen = new Set<string>();
  function load(name: string, parent: string): string {
    const path = name.startsWith(".")
      ? resolve(dirname(parent), name)
      : createRequire(parent).resolve(name);
    if (seen.has(path)) return "";
    seen.add(path);
    return readFileSync(path, "utf8").replace(
      /@import\s+["']([^"']+)["'];/g,
      (_, child: string) => load(child, path),
    );
  }
  return imports.map((name) => load(name, layout)).join("\n");
}

/** Geist, the production typeface (next/font in the plane layouts), embedded so
 * screenshots do not depend on the fonts installed on the machine. */
export function pinnedFontFace(): string {
  const font = readFileSync(
    "deploy/config/iam/themes/neon/login/resources/fonts/Geist-Variable.woff2",
  ).toString("base64");
  return `@font-face{font-family:"Geist";src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900;font-style:normal;font-display:block}
:root{--font-geist-sans:"Geist"}`;
}
