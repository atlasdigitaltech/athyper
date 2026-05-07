/**
 * apps/web Tailwind CSS configuration.
 *
 * Tailwind CSS v4 is loaded through the @config directive in globals.css. The
 * shared Athyper theme is imported directly instead of duplicating the package
 * preset into the app config.
 */

import type { Config } from "tailwindcss";
import { athyperTheme } from "@athyper/theme/tailwind-preset";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/shared/ui/ui/src/**/*.{ts,tsx}",
    "../../packages/shared/shell/shell/src/**/*.{ts,tsx}",
    "../../packages/shared/foundation/icons/src/**/*.{ts,tsx}",
    "../../packages/shared/runtime/entity-runtime/src/**/*.{ts,tsx}",
    "../../packages/shared/ui/domain-widgets/src/**/*.{ts,tsx}",
    "../../packages/shared/ui/content-ui/src/**/*.{ts,tsx}",
    "../../packages/shared/shell/navigation/src/**/*.{ts,tsx}",
    "../../packages/shared/runtime/document-runtime/src/**/*.{ts,tsx}",
    "../../packages/shared/runtime/workflow-ui/src/**/*.{ts,tsx}",
    "../../packages/shared/runtime/collaboration-ui/src/**/*.{ts,tsx}",
    "../../packages/domain/finance/finance-workbench/src/**/*.{ts,tsx}",
  ],
  theme: athyperTheme,
  plugins: [],
};

export default config;
