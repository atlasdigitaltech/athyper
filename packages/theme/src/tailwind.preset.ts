import type { Config } from "tailwindcss";

// Use Partial<Config> for presets since they don't need to specify content
const preset: Partial<Config> = {
  theme: {
    extend: {}
  },
  plugins: []
};

export default preset;
