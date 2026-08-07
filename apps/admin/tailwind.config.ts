import type { Config } from "tailwindcss";
import { athyperTheme } from "@athyper/platform-theme/tailwind-preset";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/shared/*/src/**/*.{ts,tsx}",
    "../../packages/products/admin/app/src/**/*.{ts,tsx}",
    "../../packages/products/admin/*/src/**/*.{ts,tsx}",
  ],
  theme: athyperTheme,
  plugins: [],
};

export default config;
