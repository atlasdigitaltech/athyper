export const TOOLCHAIN = Object.freeze({
  node: "24.19.0",
  pnpm: "10.33.0",
  dockerMinimum: "29.0.0",
  composeMinimum: "5.0.0",
});

export const INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;
export const RELEASE_MODES = new Set(["qa", "staging", "production"]);
export const RUNTIME_ROOT = ".athyper";
