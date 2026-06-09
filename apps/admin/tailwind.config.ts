import type { Config } from "tailwindcss";
import { athyperTheme } from "@athyper/theme/tailwind-preset";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/shared/*/src/**/*.{ts,tsx}",
    "../../packages/apps/admin/src/**/*.{ts,tsx}",
    "../../packages/apps/admin/*/src/**/*.{ts,tsx}",
  ],
  theme: athyperTheme,
  plugins: [],
};

export default config;
