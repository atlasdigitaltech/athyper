"use client";

import type { ComponentType, SVGProps } from "react";
import {
  providerDisplayName as runtimeProviderDisplayName,
  type KnownProviderId,
  type ProviderId,
} from "@athyper/atlas-agent-runtime";

/**
 * Optional diagnostic provider glyphs. The normal customer mode picker does
 * not render these; internal tooling can use the generic fallback safely.
 */

export function AnthropicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden {...props}>
      {/* Four-point sparkle / star */}
      <path d="M8 0 L9.4 6.6 L16 8 L9.4 9.4 L8 16 L6.6 9.4 L0 8 L6.6 6.6 Z" />
    </svg>
  );
}

export function OpenAiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden {...props}>
      {/* Six-petal flower — six ellipses rotated around the center */}
      <g transform="translate(8 8)">
        {Array.from({ length: 6 }).map((_, index) => (
          <ellipse
            key={index}
            rx={2}
            ry={5.5}
            transform={`rotate(${index * 30})`}
            opacity={0.85}
          />
        ))}
      </g>
    </svg>
  );
}

export function GeminiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden {...props}>
      {/* Rotated square / diamond */}
      <path d="M8 0.5 L15.5 8 L8 15.5 L0.5 8 Z" />
    </svg>
  );
}

export function AtlasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      {...props}
    >
      {/* Concentric ring / target */}
      <circle cx="8" cy="8" r="7" />
      <circle cx="8" cy="8" r="4" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GenericProviderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      {...props}
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5 8h6M8 5v6" />
    </svg>
  );
}

export const PROVIDER_ICONS: Record<KnownProviderId, ComponentType<SVGProps<SVGSVGElement>>> = {
  anthropic: AnthropicIcon,
  openai: OpenAiIcon,
  gemini: GeminiIcon,
  atlas: AtlasIcon,
};

export function providerIcon(
  providerId: ProviderId,
): ComponentType<SVGProps<SVGSVGElement>> {
  return Object.prototype.hasOwnProperty.call(PROVIDER_ICONS, providerId)
    ? PROVIDER_ICONS[providerId as KnownProviderId]
    : GenericProviderIcon;
}

export const providerDisplayName = runtimeProviderDisplayName;
