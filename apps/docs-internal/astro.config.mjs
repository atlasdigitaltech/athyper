import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Internal wiki. Content is staged from the whole docs/ tree by
// tooling/scripts/docs/stage-content.mjs (see package.json "prebuild") —
// everything except docs/customer/** is included by default. This site
// MUST sit behind Cloudflare Access (custom domain, *.pages.dev, and
// preview subdomains) before any real content is deployed — see the
// launch gates in the docs publishing plan.
export default defineConfig({
  site: "https://wiki.athyper.com",
  integrations: [
    starlight({
      title: "athyper Wiki",
      description: "Internal engineering and business documentation.",
      // No manual sidebar: this audience gets everything staged, so nav
      // autogenerates from the staged directory structure.
      customCss: ["./src/styles/atlas-theme.css"],
      head: [
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap",
          },
        },
      ],
    }),
  ],
});
