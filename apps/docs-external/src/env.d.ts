/// <reference types="astro/client" />

// Starlight resolves these configured components at runtime through its Vite
// plugin. Use the exported default component types without bypassing overrides.
declare module "virtual:starlight/components/LanguageSelect" {
  export { default } from "@astrojs/starlight/components/LanguageSelect.astro";
}
declare module "virtual:starlight/components/Search" {
  export { default } from "@astrojs/starlight/components/Search.astro";
}
declare module "virtual:starlight/components/SiteTitle" {
  export { default } from "@astrojs/starlight/components/SiteTitle.astro";
}
declare module "virtual:starlight/components/SocialIcons" {
  export { default } from "@astrojs/starlight/components/SocialIcons.astro";
}
declare module "virtual:starlight/components/ThemeSelect" {
  export { default } from "@astrojs/starlight/components/ThemeSelect.astro";
}

declare module "virtual:starlight/user-config" {
  const config: import("@astrojs/starlight/types").StarlightConfig;
  export default config;
}
