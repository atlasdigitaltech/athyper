"use client";

import * as React from "react";
import { getPlaneBrand, type BrandPlane } from "@athyper/platform-brand";
import {
  AppErrorBoundary,
  AppLoadingBoundary,
  GlobalAppErrorBoundary,
} from "./boundaries";

/** Plane identity is sourced from the existing brand catalog, not copied by routes. */
export function ApplicationLoading({
  plane,
  collapsed = false,
  content = false,
}: {
  readonly plane: BrandPlane;
  readonly collapsed?: boolean;
  readonly content?: boolean;
}) {
  const brand = getPlaneBrand(plane);
  return (
    <AppLoadingBoundary
      kind={content ? "refresh" : "bootstrap"}
      label={
        content
          ? `Updating ${brand.shortName} workspace`
          : `Loading ${brand.applicationName}`
      }
      collapsed={collapsed}
      applicationName={brand.shortName}
      planeDescriptor={brand.description}
      planeIconSrc={brand.appIcon.src}
      planeWordmarkSrc={brand.identityLockup.src}
      persistentDesktopBrand
    />
  );
}

/** Framework root fallback: renders its own document and needs no application providers. */
export function ApplicationFatalError({
  plane,
  error,
}: {
  readonly plane: BrandPlane;
  readonly error: Error & { readonly digest?: string };
}) {
  return (
    <GlobalAppErrorBoundary
      applicationName={getPlaneBrand(plane).applicationName}
      error={error}
      reset={() => window.location.reload()}
    />
  );
}

/** Shared recovery for framework root/startup errors and authenticated content errors. */
export function ApplicationError({
  plane,
  error,
  retry,
  content = false,
}: {
  readonly plane: BrandPlane;
  readonly error: Error & { readonly digest?: string };
  readonly retry?: () => void;
  readonly content?: boolean;
}) {
  return (
    <AppErrorBoundary
      applicationName={getPlaneBrand(plane).applicationName}
      error={error}
      reset={retry ?? (() => window.location.reload())}
      surface={content ? "content" : "page"}
      homeHref={content ? "/home" : undefined}
    />
  );
}
