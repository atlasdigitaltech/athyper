"use client";

import { useEffect, useState } from "react";
import { getPublicBrandAssets } from "@athyper/brand";
import { getPlaneConfig, type PlaneKey } from "@athyper/session-plane";

import { AUTH_TRANSITION_MIN_MS } from "./auth-transition-timing";

const MESSAGE_DELAY_MS = 300;
const LONG_WAIT_DELAY_MS = 5_000;

export interface BrandedAuthLoaderProps {
  plane: PlaneKey;
  message: string;
  longWaitMessage: string;
}

export function BrandedAuthLoader({
  plane,
  message,
  longWaitMessage,
}: BrandedAuthLoaderProps) {
  const assets = getPublicBrandAssets(plane);
  const product = getPlaneConfig(plane);
  const [messageVisible, setMessageVisible] = useState(false);
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    const messageTimer = window.setTimeout(() => setMessageVisible(true), MESSAGE_DELAY_MS);
    const longWaitTimer = window.setTimeout(() => setLongWait(true), LONG_WAIT_DELAY_MS);
    return () => {
      window.clearTimeout(messageTimer);
      window.clearTimeout(longWaitTimer);
    };
  }, []);

  return (
    <main
      className="flex min-h-dvh items-center justify-center overflow-hidden bg-background px-6"
      aria-busy="true"
      aria-label={message}
      data-loading-skeleton="branded-auth"
      data-minimum-presentation-ms={AUTH_TRANSITION_MIN_MS}
      data-plane={plane}
    >
      <div className="flex w-full max-w-[30rem] flex-col items-center gap-6 text-center">
        <div className="flex w-full items-center justify-center gap-3 sm:gap-5" aria-hidden="true">
          <div className="athyper-auth-orbit flex h-14 w-14 shrink-0 items-center justify-center rounded-full sm:h-16 sm:w-16">
            <img
              alt=""
              className="relative z-10 h-7 w-7 rounded-md object-contain sm:h-8 sm:w-8"
              draggable={false}
              src={assets.favicon}
            />
          </div>
          <div
            className="relative flex min-w-0 max-w-[calc(100%_-_4.5rem)] items-center sm:h-14 sm:max-w-[18rem]"
            data-brand-lockup={plane}
          >
            <img
              alt=""
              className="block h-10 w-auto max-w-full object-contain sm:h-full"
              draggable={false}
              src={assets.wordmarkBlack}
            />
            <span className="athyper-auth-wordmark-sweep absolute inset-0" />
          </div>
        </div>
        <div className="flex h-10 w-full max-w-[30rem] items-start justify-center sm:h-5">
          <p
            role="status"
            aria-live="polite"
            className={`text-xs leading-5 text-muted-foreground transition-opacity ${
              messageVisible ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {longWait ? longWaitMessage : message}
          </p>
        </div>
        <span className="sr-only">{product.productName}</span>
      </div>

      <style>{`
        @keyframes athyper-auth-orbit-spin {
          to { transform: rotate(1turn); }
        }
        @keyframes athyper-auth-wordmark-shine {
          from { transform: translateX(-140%); }
          to { transform: translateX(140%); }
        }
        .athyper-auth-orbit {
          position: relative;
          background: color-mix(in oklab, var(--muted) 55%, transparent);
        }
        .athyper-auth-orbit::before {
          position: absolute;
          inset: 0;
          border: 2px solid color-mix(in oklab, var(--foreground) 20%, transparent);
          border-top-color: color-mix(in oklab, var(--foreground) 82%, transparent);
          border-right-color: color-mix(in oklab, var(--foreground) 48%, transparent);
          border-radius: 9999px;
          content: "";
          animation: athyper-auth-orbit-spin 1.35s linear infinite;
        }
        .athyper-auth-wordmark-sweep {
          background: linear-gradient(100deg, transparent 20%, color-mix(in oklab, white 78%, transparent) 50%, transparent 80%);
          mix-blend-mode: screen;
          pointer-events: none;
          animation: athyper-auth-wordmark-shine 1.8s ease-in-out infinite;
          -webkit-mask: url("${assets.wordmarkBlack}") center / contain no-repeat;
          mask: url("${assets.wordmarkBlack}") center / contain no-repeat;
        }
        @media (prefers-reduced-motion: reduce) {
          .athyper-auth-orbit::before, .athyper-auth-wordmark-sweep { animation: none; }
          .athyper-auth-wordmark-sweep { display: none; }
        }
      `}</style>
    </main>
  );
}
