import type { Metadata } from "next";
import { getPublicBrandAssets } from "@athyper/brand";
import { getPlaneConfig, type PlaneKey } from "@athyper/session-plane";

export function createPlaneMetadata(plane: PlaneKey): Metadata {
  const config = getPlaneConfig(plane);
  const brandAssets = getPublicBrandAssets(plane);

  return {
    title: config.browserTitle,
    description: config.productName,
    applicationName: config.appName,
    icons: {
      icon: [{ url: brandAssets.favicon, type: "image/png" }],
      shortcut: [{ url: brandAssets.favicon, type: "image/png" }],
      apple: [{ url: brandAssets.appIcon, type: "image/png" }],
    },
  };
}
