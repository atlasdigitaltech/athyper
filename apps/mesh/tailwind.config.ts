import type { Config } from "tailwindcss";
import { athyperTheme } from "@athyper/platform-theme/tailwind-preset";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/shared/*/src/**/*.{ts,tsx}",
    "../../packages/products/mesh/app/src/**/*.{ts,tsx}",
    "../../packages/products/mesh/*/src/**/*.{ts,tsx}",
  ],
  theme: athyperTheme,
  plugins: [],
};

export default config;
