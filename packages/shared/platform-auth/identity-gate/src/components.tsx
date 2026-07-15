import { useEffect, useState, type ReactNode } from "react";
import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";
import { getPublicBrandAssets } from "@athyper/brand";

import { getAuthExperience, type MarketingSlide } from "./experience";
import type { AuthLayoutVariant } from "./types";

declare const process:
  | {
      env: {
        NEXT_PUBLIC_ENVIRONMENT?: string;
        NODE_ENV?: string;
      };
    }
  | undefined;

interface AuthShellProps {
  plane: PlaneKey;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: AuthLayoutVariant;
}

const AUTO_ADVANCE_MS = 2000;
const PLANE_SWITCH_ORDER = ["neon", "mesh", "admin"] as const satisfies readonly PlaneKey[];

const CLIENT_ENVIRONMENT =
  typeof process === "undefined"
    ? undefined
    : process.env.NEXT_PUBLIC_ENVIRONMENT ?? process.env.NODE_ENV;

interface HeroCopy {
  title: string;
  subtitle: string;
}

interface PreviewScenario {
  recordCode: string;
  recordState: string;
  title: string;
  status: string;
  primaryMetric: string;
  secondaryMetric: string;
  signal: PreviewSignal;
  stages: string[];
}

interface PreviewSignal {
  kind: "workflow" | "network" | "control";
  title: string;
  value: string;
  detail: string;
  bars: Array<{
    label: string;
    value: number;
  }>;
}

export function AuthShell({
  plane,
  title,
  subtitle,
  children,
  footer,
  variant = "brand",
}: AuthShellProps) {
  const config = getPlaneConfig(plane);
  const productLabel = `${config.appName} - ${config.productName}`;
  const [currentHost, setCurrentHost] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCurrentHost(window.location.host);
  }, []);

  if (variant === "compact") {
    return (
      <main className="min-h-screen bg-background px-4 py-6 text-foreground">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md items-center">
          <section className="w-full space-y-6">
            <ProductMark plane={plane} />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{productLabel}</p>
              <h1 className="text-2xl font-medium">{title}</h1>
              {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {children}
            {footer ? <div className="pt-4">{footer}</div> : null}
          </section>
        </div>
      </main>
    );
  }

  const hero = getHeroCopy(plane);

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <style>{`
        @keyframes auth-progress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes auth-signal-dash {
          to { stroke-dashoffset: -28; }
        }
        @keyframes auth-signal-pulse {
          0%, 100% { opacity: 0.72; transform: scale(0.92); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes auth-bar-rise {
          from { transform: scaleY(0.18); }
          to { transform: scaleY(1); }
        }
        @keyframes auth-command-sheen {
          0% { transform: translateX(-120%); opacity: 0; }
          25% { opacity: 0.5; }
          65%, 100% { transform: translateX(140%); opacity: 0; }
        }
        @keyframes auth-command-settle {
          0% { transform: scale(0.985); }
          100% { transform: scale(1); }
        }
        @keyframes auth-command-dot {
          0%, 100% { opacity: 0.68; box-shadow: 0 0 0 0 color-mix(in oklab, var(--background) 34%, transparent); }
          50% { opacity: 1; box-shadow: 0 0 0 4px transparent; }
        }
        @keyframes auth-record-pulse {
          0%, 100% {
            border-color: color-mix(in oklab, var(--foreground) 12%, transparent);
            box-shadow: 0 0 0 0 color-mix(in oklab, var(--foreground) 0%, transparent);
          }
          50% {
            border-color: color-mix(in oklab, var(--foreground) 26%, transparent);
            box-shadow: 0 0 0 3px color-mix(in oklab, var(--foreground) 5%, transparent);
          }
        }
        @keyframes auth-record-refresh {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .auth-showcase-bg {
          background:
            linear-gradient(180deg, color-mix(in oklab, var(--muted) 66%, transparent), transparent 22rem),
            linear-gradient(90deg, color-mix(in oklab, var(--primary) 7%, transparent), transparent 42%),
            var(--background);
        }
        .auth-showcase-grid {
          background-image:
            linear-gradient(color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: linear-gradient(90deg, transparent, black 18%, black 82%, transparent);
        }
        .auth-plane-switch {
          background: color-mix(in oklab, var(--muted) 72%, var(--background));
          border-color: color-mix(in oklab, var(--foreground) 16%, transparent);
          box-shadow:
            inset 0 1px 0 color-mix(in oklab, var(--background) 78%, transparent),
            0 8px 28px color-mix(in oklab, var(--foreground) 6%, transparent);
        }
        .auth-plane-segment {
          color: color-mix(in oklab, var(--foreground) 58%, transparent);
          transition: background-color 180ms ease, color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
        }
        .auth-plane-segment:hover {
          color: var(--foreground);
          transform: translateY(-1px);
        }
        .auth-plane-segment-primary {
          background: color-mix(in oklab, var(--background) 94%, white);
          color: var(--foreground);
          box-shadow:
            0 1px 0 color-mix(in oklab, var(--background) 92%, transparent),
            0 8px 18px color-mix(in oklab, var(--foreground) 8%, transparent);
        }
        .auth-showcase-card {
          background: color-mix(in oklab, var(--card) 94%, var(--background));
          border-color: color-mix(in oklab, var(--foreground) 12%, transparent);
          box-shadow: 0 18px 60px color-mix(in oklab, var(--foreground) 9%, transparent);
        }
        .auth-login-column {
          min-width: 0;
          width: min(24rem, calc(100vw - 4rem));
        }
        .auth-form-stack {
          width: 100%;
        }
        @media (min-width: 640px) {
          .auth-login-column {
            width: min(34rem, calc(100vw - 4rem));
          }
          .auth-form-stack {
            width: min(30rem, 100%);
          }
        }
        @media (min-width: 1024px) {
          .auth-form-stack {
            width: min(28rem, 100%);
          }
        }
        .auth-preview-frame {
          background: color-mix(in oklab, var(--background) 96%, var(--primary));
          border-color: color-mix(in oklab, var(--foreground) 14%, transparent);
          box-shadow: 0 24px 80px color-mix(in oklab, var(--foreground) 10%, transparent);
        }
        .auth-preview-command {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background: color-mix(in oklab, var(--background) 90%, var(--muted));
          border-color: color-mix(in oklab, var(--foreground) 11%, transparent);
          transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
        }
        .auth-preview-command:hover {
          border-color: color-mix(in oklab, var(--foreground) 24%, transparent);
          transform: translateY(-1px);
          box-shadow: 0 8px 20px color-mix(in oklab, var(--foreground) 7%, transparent);
        }
        .auth-preview-command:active {
          transform: translateY(0);
        }
        .auth-preview-command-active {
          background: var(--foreground);
          border-color: var(--foreground);
          color: var(--background);
          animation: auth-command-settle 180ms ease-out both;
          box-shadow: 0 10px 22px color-mix(in oklab, var(--foreground) 14%, transparent);
        }
        .auth-preview-command-active:hover {
          transform: none;
        }
        .auth-preview-command-active::before {
          content: "";
          position: absolute;
          inset: -1px;
          z-index: -1;
          background: linear-gradient(
            105deg,
            transparent 0%,
            transparent 34%,
            color-mix(in oklab, var(--background) 24%, transparent) 48%,
            transparent 62%,
            transparent 100%
          );
          animation: auth-command-sheen 2400ms ease-in-out infinite;
        }
        .auth-command-label {
          position: relative;
          z-index: 1;
        }
        .auth-command-dot {
          position: relative;
          z-index: 1;
          background: var(--background);
          animation: auth-command-dot 1600ms ease-in-out infinite;
        }
        .auth-signal-card {
          background: color-mix(in oklab, var(--background) 82%, var(--muted));
          border-color: color-mix(in oklab, var(--foreground) 10%, transparent);
        }
        .auth-motion-signal {
          background:
            linear-gradient(135deg, color-mix(in oklab, var(--muted) 56%, transparent), transparent 56%),
            color-mix(in oklab, var(--background) 92%, var(--muted));
          border-color: color-mix(in oklab, var(--foreground) 11%, transparent);
        }
        .auth-signal-link {
          stroke: color-mix(in oklab, var(--foreground) 24%, transparent);
        }
        .auth-signal-link-active {
          stroke: var(--foreground);
          stroke-dasharray: 4 5;
          animation: auth-signal-dash 1400ms linear infinite;
        }
        .auth-signal-node {
          fill: color-mix(in oklab, var(--background) 90%, var(--muted));
          stroke: color-mix(in oklab, var(--foreground) 28%, transparent);
        }
        .auth-signal-node-active {
          fill: var(--foreground);
          stroke: var(--foreground);
          transform-box: fill-box;
          transform-origin: center;
          animation: auth-signal-pulse 1800ms ease-in-out infinite;
        }
        .auth-signal-bar {
          transform-box: fill-box;
          transform-origin: bottom;
          animation: auth-bar-rise 900ms ease-out both;
        }
        .auth-signal-packet {
          fill: var(--foreground);
          transform-box: fill-box;
          transform-origin: center;
          animation: auth-signal-pulse 1400ms ease-in-out infinite;
        }
        .auth-signal-stage-button {
          border-color: transparent;
          color: color-mix(in oklab, var(--foreground) 62%, transparent);
          transition: color 160ms ease, transform 160ms ease;
        }
        .auth-signal-stage-button:hover {
          color: var(--foreground);
          transform: translateY(-1px);
        }
        .auth-signal-stage-button:focus-visible {
          outline: 2px solid var(--foreground);
          outline-offset: 3px;
        }
        .auth-signal-stage-button-active {
          color: var(--foreground);
        }
        .auth-signal-hit {
          border-color: color-mix(in oklab, var(--foreground) 10%, transparent);
          transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, transform 160ms ease;
        }
        .auth-signal-hit:hover {
          border-color: color-mix(in oklab, var(--foreground) 30%, transparent);
          transform: translateY(-1px);
        }
        .auth-signal-hit-active {
          background: var(--foreground);
          border-color: var(--foreground);
          color: var(--background);
        }
        .auth-record-card {
          animation: auth-record-pulse 3200ms ease-in-out infinite;
        }
        .auth-record-code {
          animation: auth-record-refresh 220ms ease-out both;
        }
        .auth-mono-primary {
          background: var(--foreground);
          color: var(--background);
        }
        .auth-mono-primary:hover { background: color-mix(in oklab, var(--foreground) 86%, var(--background)); }
        .auth-mono-secondary {
          background: var(--background);
          border-color: var(--border);
          color: var(--foreground);
        }
        .auth-mono-secondary:hover { background: var(--muted); }
        @media (prefers-reduced-motion: reduce) {
          .auth-progress-bar,
          .auth-signal-link-active,
          .auth-signal-node-active,
          .auth-signal-bar,
          .auth-signal-packet,
          .auth-preview-command-active,
          .auth-preview-command-active::before,
          .auth-command-dot,
          .auth-record-card,
          .auth-record-code {
            animation: none !important;
            transform: none !important;
          }
          .auth-progress-bar { transform: scaleX(1) !important; }
        }
      `}</style>
      <div className="auth-showcase-bg relative min-h-screen">
        <div className="auth-showcase-grid pointer-events-none absolute inset-x-0 top-20 hidden h-[38rem] opacity-70 lg:block" />
        <AuthTopNav plane={plane} currentHost={currentHost} />
        <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl grid-cols-1 gap-8 px-5 pb-6 pt-2 sm:px-8 lg:grid-cols-[minmax(28rem,34rem)_minmax(0,1fr)] lg:items-start lg:gap-12 lg:px-10 xl:px-12">
          <section className="flex min-h-[calc(100vh-5rem)] min-w-0 flex-col justify-between py-6 lg:py-10">
            <div className="auth-login-column">
              <div className="space-y-3">
                <h1 className="max-w-full whitespace-pre-line break-words text-4xl font-medium leading-[1.02] tracking-normal sm:text-5xl">
                  {hero.title}
                </h1>
                <p className="max-w-sm text-base leading-6 text-muted-foreground">
                  {hero.subtitle}
                </p>
              </div>
              <div className="auth-form-stack mt-8">
                <div className="auth-showcase-card w-full rounded-lg border p-4 sm:p-5">
                  <div className="mb-4 space-y-1">
                    <h2 className="text-2xl font-medium leading-tight">{title}</h2>
                    {subtitle ? <p className="text-sm leading-5 text-muted-foreground">{subtitle}</p> : null}
                  </div>
                  {children}
                </div>
              </div>
            </div>
            {footer ? <div className="mt-8 w-full">{footer}</div> : null}
          </section>
          <aside className="relative hidden min-h-0 lg:block lg:pt-10">
            <BrandPanel plane={plane} />
          </aside>
        </div>
      </div>
    </main>
  );
}

export function ProductMark({
  plane,
  inverted = false,
}: {
  plane: PlaneKey;
  inverted?: boolean;
}) {
  return (
    <ProductLogoAsset
      plane={plane}
      tone={inverted ? "light" : "dark"}
      className="text-4xl"
      iconClassName="h-12 w-12"
    />
  );
}

function ProductLogoAsset({
  plane,
  tone,
  className,
  iconClassName,
  showIcon = true,
}: {
  plane: PlaneKey;
  tone: "dark" | "light";
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
}) {
  const brandAssets = getPublicBrandAssets(plane);
  const wordmarkSrc = tone === "light" ? brandAssets.wordmarkWhite : brandAssets.wordmarkBlack;
  const productName = getPlaneConfig(plane).appName.toLowerCase();
  const accessibleName = plane === "admin" ? "athyper admin" : productName;
  return (
    <span className={["inline-flex items-center gap-3", className].filter(Boolean).join(" ")}>
      {showIcon ? (
        <img
          alt=""
          aria-hidden="true"
          className={["shrink-0 rounded-sm object-cover", iconClassName ?? "h-12 w-12"].join(" ")}
          draggable={false}
          src={brandAssets.appIcon}
        />
      ) : null}
      <img
        alt={accessibleName}
        className="h-[1em] max-h-16 w-auto max-w-[14rem] object-contain"
        draggable={false}
        src={wordmarkSrc}
      />
    </span>
  );
}

function AuthTopNav({ plane, currentHost }: { plane: PlaneKey; currentHost: string | null }) {
  return (
    <header className="relative z-10 mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10 xl:px-12">
      <ProductLogoAsset
        plane={plane}
        tone="dark"
        className="text-3xl"
        iconClassName="h-9 w-9"
      />
      <div className="hidden items-center gap-5 sm:flex">
        <PlaneSwitchLinks current={plane} currentHost={currentHost} />
      </div>
    </header>
  );
}

function PlaneSwitchLinks({ current, currentHost }: { current: PlaneKey; currentHost: string | null }) {
  const targets = PLANE_SWITCH_ORDER.filter((plane) => plane !== current);

  return (
    <nav
      aria-label="Switch application"
      className="auth-plane-switch grid min-w-64 grid-cols-2 rounded-lg border p-1 text-sm font-medium"
    >
      {targets.map((target, index) => {
        const targetConfig = getPlaneConfig(target);
        const href = resolvePlaneLoginHref(target, currentHost);
        const label = target === "admin" ? "athyper Admin" : targetConfig.appName;
        return (
          <a
            key={target}
            className={[
              "auth-plane-segment rounded-md px-5 py-2.5 text-center leading-none",
              index === 0 ? "auth-plane-segment-primary" : "",
            ].join(" ")}
            href={href}
            onClick={(event) => {
              if (typeof window === "undefined") return;
              const nextHref = resolvePlaneLoginHref(target, window.location.host);
              if (nextHref === event.currentTarget.href) return;
              event.preventDefault();
              window.location.assign(nextHref);
            }}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}

function resolvePlaneLoginHref(plane: PlaneKey, currentHost: string | null): string {
  const config = getPlaneConfig(plane);
  return `${resolvePlaneBaseUrl(plane, currentHost)}${config.loginPath}`;
}

function resolvePlaneBaseUrl(plane: PlaneKey, currentHost: string | null): string {
  const config = getPlaneConfig(plane);
  const host = normalizeSwitchHost(currentHost);

  if (isLocalSwitchHost(host)) {
    return `https://${config.localHost}`;
  }

  const athyperCom = /^(?:neon|mesh|admin)(-[a-z0-9-]+)?\.athyper\.com$/i.exec(host);
  if (athyperCom) {
    return `https://${plane}${athyperCom[1] ?? ""}.athyper.com`;
  }

  const environment = (CLIENT_ENVIRONMENT ?? "").toLowerCase();
  if (environment === "local" || environment === "development" || environment === "dev") {
    return `https://${config.localHost}`;
  }
  if (environment === "staging" || environment === "stage") {
    return `https://${plane}-staging.athyper.com`;
  }

  return `https://${config.publicHost}`;
}

function normalizeSwitchHost(host: string | null): string {
  let normalized = (host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/\/.*$/, "");

  if (normalized === "::1") return normalized;
  if (normalized.startsWith("[")) {
    const end = normalized.indexOf("]");
    if (end >= 0) return normalized.slice(0, end + 1);
  }

  normalized = normalized.replace(/:\d+$/, "");
  return normalized;
}

function isLocalSwitchHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".athyper.local")
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      aria-live="polite"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

export function LoadingState({
  message = "Loading...",
  plane = "neon",
}: {
  message?: string;
  plane?: PlaneKey;
}) {
  const brandAssets = getPublicBrandAssets(plane);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-10 w-10 animate-pulse items-center justify-center rounded-md bg-primary">
          <img
            alt=""
            aria-hidden="true"
            className="h-6 w-6 rounded-sm object-cover"
            draggable={false}
            src={brandAssets.appIcon}
          />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}

export function PrimaryAction({
  href,
  children,
  disabled,
  onClick,
  size = "default",
  type = "button",
}: {
  href?: string;
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  size?: "default" | "large";
  type?: "button" | "submit";
}) {
  const className = [
    "auth-mono-primary inline-flex w-full items-center justify-center gap-3 rounded-md px-4 text-base font-medium transition-colors",
    size === "large" ? "h-[60px]" : "h-10",
    disabled ? "pointer-events-none opacity-60" : "",
  ].join(" ");
  if (href) {
    return (
      <a className={className} href={disabled ? undefined : href} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button className={className} disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  );
}

export function SecondaryAction({
  href,
  children,
  disabled,
  onClick,
}: {
  href?: string;
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const className = [
    "auth-mono-secondary inline-flex h-10 w-full items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors",
    disabled ? "pointer-events-none opacity-60" : "",
  ].join(" ");
  if (href) {
    return (
      <a className={className} href={disabled ? undefined : href} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button className={className} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

export function TextLinkButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function AthyperSignInIcon({ plane = "neon" }: { plane?: PlaneKey }) {
  const brandAssets = getPublicBrandAssets(plane);
  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-5 w-5 shrink-0 rounded-sm object-cover"
      draggable={false}
      src={brandAssets.appIcon}
    />
  );
}

export function SecurityHint() {
  return (
    <p className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground/60">
      <LockIcon className="h-3.5 w-3.5" />
      <span>SSO secured &middot; MFA enforced</span>
    </p>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect height="10" rx="2" width="14" x="5" y="11" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function BrandPanel({ plane }: { plane: PlaneKey }) {
  const experience = getAuthExperience(plane);
  const slides = experience.slides;
  const [slide, setSlide] = useState(0);
  const [resumeKey, setResumeKey] = useState(0);
  const [activeCommand, setActiveCommand] = useState(0);

  useEffect(() => {
    setSlide(0);
    setActiveCommand(0);
    setResumeKey((key) => key + 1);
  }, [plane]);

  useEffect(() => {
    const restart = () => {
      if (document.visibilityState !== "hidden") {
        setResumeKey((key) => key + 1);
      }
    };

    window.addEventListener("pageshow", restart);
    document.addEventListener("visibilitychange", restart);

    return () => {
      window.removeEventListener("pageshow", restart);
      document.removeEventListener("visibilitychange", restart);
    };
  }, []);

  const current = slides[slide] ?? slides[0]!;
  const currentNavLabel = current.navLabel ?? current.label;
  const commands = current.tags.length > 0 ? current.tags : [currentNavLabel];
  const activeCommandIndex = Math.min(activeCommand, commands.length - 1);
  const activeCommandLabel = commands[activeCommandIndex] ?? currentNavLabel;
  const preview = buildPreviewScenario(plane, current, slide, activeCommandLabel);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (activeCommandIndex < commands.length - 1) {
        setActiveCommand(activeCommandIndex + 1);
        return;
      }
      setSlide((s) => (s + 1) % slides.length);
      setActiveCommand(0);
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeCommandIndex, commands.length, resumeKey, slide, slides.length]);

  return (
    <div className="ml-auto w-full max-w-[45rem]">
      <PreviewWorkbench
        activeCommandIndex={activeCommandIndex}
        activeCommandLabel={activeCommandLabel}
        commands={commands}
        onCommandSelect={setActiveCommand}
        plane={plane}
        preview={preview}
        slide={current}
        slideIndex={slide}
      />

      <div className="relative mt-5 space-y-3 border-t pt-4">
        <div className="absolute left-0 right-0 top-0 h-px overflow-hidden bg-border">
          <div
            key={`${plane}-${slide}-${activeCommandIndex}-${resumeKey}`}
            className="auth-progress-bar h-full origin-left bg-foreground"
            style={{
              animation: `auth-progress ${AUTO_ADVANCE_MS}ms linear forwards`,
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {slides.map((item, i) => {
            const label = item.navLabel ?? item.label;
            const active = i === slide;
            return (
              <button
                key={item.label}
                aria-label={`Show ${item.label} slide`}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setSlide(i);
                  setActiveCommand(0);
                }}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PreviewWorkbench({
  activeCommandIndex,
  activeCommandLabel,
  commands,
  onCommandSelect,
  plane,
  preview,
  slide,
  slideIndex,
}: {
  activeCommandIndex: number;
  activeCommandLabel: string;
  commands: string[];
  onCommandSelect: (index: number) => void;
  plane: PlaneKey;
  preview: PreviewScenario;
  slide: MarketingSlide;
  slideIndex: number;
}) {
  const activeStageIndex = Math.min(activeCommandIndex, Math.max(preview.stages.length - 1, 0));

  return (
    <div className="auth-preview-frame overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ProductLogoAsset
              plane={plane}
              tone="dark"
              className="text-xl"
              iconClassName="h-6 w-6"
              showIcon={false}
            />
            <span className="max-w-full rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {preview.status}
            </span>
          </div>
          <p className="mt-2 truncate text-sm font-medium">{preview.title}</p>
        </div>
        <div className="auth-record-card shrink-0 rounded-md border bg-background px-3 py-2 text-right">
          <p key={preview.recordCode} className="auth-record-code text-sm font-medium">{preview.recordCode}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            <span>{preview.recordState}</span>
          </p>
        </div>
      </div>

      <div
        key={`${plane}-${slide.label}`}
        className="border-b px-4 py-3 animate-in fade-in slide-in-from-bottom-3 duration-500"
      >
        <div className="min-w-0">
          <h2 className="max-w-2xl text-xl font-medium leading-tight">
            {slide.title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-5 text-muted-foreground">
            {slide.body}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x border-b bg-muted/30">
        <PreviewMetric label="Focus" value={activeCommandLabel} />
        <PreviewMetric label="Health" value={preview.primaryMetric} />
        <PreviewMetric label="Queue" value={preview.secondaryMetric} />
      </div>

      <div>
        <div className="border-b p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {commands.slice(0, 6).map((command, index) => {
            const active = index === activeCommandIndex;
            return (
              <button
                aria-pressed={active}
                className={`auth-preview-command flex h-10 items-center gap-2 rounded-md border px-3 text-left text-xs font-medium ${
                  active ? "auth-preview-command-active" : "text-foreground"
                }`}
                key={command}
                onClick={() => onCommandSelect(index)}
                type="button"
              >
                {active ? <span aria-hidden="true" className="auth-command-dot h-1.5 w-1.5 shrink-0 rounded-full" /> : null}
                <span className="auth-command-label block min-w-0 truncate">{command}</span>
              </button>
            );
          })}
          </div>
        </div>

        <PreviewMotionSignal
          activeCommandLabel={activeCommandLabel}
          activeIndex={activeStageIndex}
          onStageSelect={(stageIndex) => onCommandSelect(stageIndex % commands.length)}
          plane={plane}
          preview={preview}
        />
      </div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function PreviewMotionSignal({
  activeCommandLabel,
  activeIndex,
  onStageSelect,
  plane,
  preview,
}: {
  activeCommandLabel: string;
  activeIndex: number;
  onStageSelect: (stageIndex: number) => void;
  plane: PlaneKey;
  preview: PreviewScenario;
}) {
  const signal = preview.signal;
  const activeStage = preview.stages[activeIndex] ?? preview.stages[0] ?? "Ready";
  return (
    <section className="p-4" aria-label={signal.title}>
      <div className="auth-motion-signal rounded-lg border p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{signal.title}</p>
            <h3 className="mt-1 truncate text-lg font-medium">{activeCommandLabel}</h3>
            <p className="mt-1 max-w-lg text-sm leading-5 text-muted-foreground">{signal.detail}</p>

            <div className="mt-4 rounded-md border bg-background/70 p-3">
              {signal.kind === "network" ? (
                <NetworkSignalGraph activeIndex={activeIndex} onStageSelect={onStageSelect} plane={plane} stages={preview.stages} />
              ) : signal.kind === "control" ? (
                <ControlSignalGraph activeIndex={activeIndex} onStageSelect={onStageSelect} stages={preview.stages} />
              ) : (
                <WorkflowSignalGraph activeIndex={activeIndex} onStageSelect={onStageSelect} stages={preview.stages} />
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-between rounded-md border bg-background/70 p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <SignalStat label="Stage" value={activeStage} />
              <SignalStat label="Signal" value={signal.value} />
            </div>
            <SignalBars bars={signal.bars} />
          </div>
        </div>
      </div>
    </section>
  );
}

function SignalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-sm bg-muted/50 px-2 py-1.5">
      <p className="truncate text-[10px] font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-medium leading-4">{value}</p>
    </div>
  );
}

function WorkflowSignalGraph({
  activeIndex,
  onStageSelect,
  stages,
}: {
  activeIndex: number;
  onStageSelect: (stageIndex: number) => void;
  stages: string[];
}) {
  const points = stages.map((stage, index) => ({
    label: stage,
    x: 25 + index * 50,
  }));

  return (
    <div>
      <svg aria-hidden="true" className="h-12 w-full overflow-visible" viewBox="0 0 200 48">
        {points.slice(0, -1).map((point, index) => (
          <line
            className={index < activeIndex ? "auth-signal-link-active" : "auth-signal-link"}
            key={`${point.label}:line`}
            strokeLinecap="round"
            strokeWidth="2"
            x1={point.x + 7}
            x2={points[index + 1]!.x - 7}
            y1="22"
            y2="22"
          />
        ))}
        {points.map((point, index) => (
          <circle
            className={index <= activeIndex ? "auth-signal-node-active" : "auth-signal-node"}
            cx={point.x}
            cy="22"
            key={point.label}
            r="6"
            strokeWidth="2"
          />
        ))}
        {activeIndex > 0 ? (
          <circle
            className="auth-signal-packet"
            cx={points[activeIndex]?.x ?? points[0]?.x ?? 25}
            cy="22"
            r="3"
          />
        ) : null}
      </svg>
      <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-medium text-muted-foreground">
        {stages.map((stage, index) => (
          <button
            aria-label={`Show ${stage} stage`}
            aria-pressed={index === activeIndex}
            className={`auth-signal-stage-button min-w-0 truncate rounded-sm px-1 py-1 text-[10px] font-medium ${
              index === activeIndex ? "auth-signal-stage-button-active" : ""
            }`}
            key={`${stage}:label`}
            onClick={() => onStageSelect(index)}
            type="button"
          >
            {stage}
          </button>
        ))}
      </div>
    </div>
  );
}

function NetworkSignalGraph({
  activeIndex,
  onStageSelect,
  plane,
  stages,
}: {
  activeIndex: number;
  onStageSelect: (stageIndex: number) => void;
  plane: PlaneKey;
  stages: string[];
}) {
  const nodes = [
    { id: "center", x: 78, y: 30 },
    { id: "partner-a", x: 30, y: 16 },
    { id: "partner-b", x: 126, y: 18 },
    { id: "partner-c", x: 44, y: 54 },
    { id: "partner-d", x: 116, y: 55 },
  ];
  const links = nodes.slice(1);

  return (
    <div>
      <svg
        aria-hidden="true"
        className="h-20 w-full overflow-visible"
        key={`${plane}:network`}
        viewBox="0 0 156 70"
      >
        {links.map((node, index) => (
          <line
            className={index <= activeIndex ? "auth-signal-link-active" : "auth-signal-link"}
            key={`${node.id}:link`}
            strokeLinecap="round"
            strokeWidth="1.8"
            x1={nodes[0]!.x}
            x2={node.x}
            y1={nodes[0]!.y}
            y2={node.y}
          />
        ))}
        {nodes.map((node, index) => (
          <circle
            className={index === 0 || index - 1 <= activeIndex ? "auth-signal-node-active" : "auth-signal-node"}
            cx={node.x}
            cy={node.y}
            key={node.id}
            r={index === 0 ? "8" : "5.5"}
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="grid grid-cols-4 gap-1 text-center">
        {stages.map((stage, index) => (
          <button
            aria-label={`Show ${stage} stage`}
            aria-pressed={index === activeIndex}
            className={`auth-signal-stage-button min-w-0 truncate rounded-sm px-1 py-1 text-[10px] font-medium ${
              index === activeIndex ? "auth-signal-stage-button-active" : ""
            }`}
            key={`${stage}:network-label`}
            onClick={() => onStageSelect(index)}
            type="button"
          >
            {stage}
          </button>
        ))}
      </div>
    </div>
  );
}

function ControlSignalGraph({
  activeIndex,
  onStageSelect,
  stages,
}: {
  activeIndex: number;
  onStageSelect: (stageIndex: number) => void;
  stages: string[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {stages.map((stage, index) => {
        const active = index <= activeIndex;
        return (
          <button
            aria-label={`Show ${stage} stage`}
            aria-pressed={index === activeIndex}
            className={`auth-signal-hit rounded-md border px-2 py-2 text-left ${
              active ? "auth-signal-hit-active" : "bg-background text-muted-foreground"
            }`}
            key={`${stage}:control`}
            onClick={() => onStageSelect(index)}
            type="button"
          >
            <span className="block truncate text-[11px] font-medium">{stage}</span>
            <span className="mt-1 block h-1 rounded-full bg-current opacity-40" />
          </button>
        );
      })}
    </div>
  );
}

function SignalBars({ bars }: { bars: PreviewSignal["bars"] }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {bars.map((bar, index) => (
        <div className="min-w-0" key={bar.label}>
          <div className="flex h-20 items-end justify-center rounded-sm bg-muted/70 px-1">
            <span
              className="auth-signal-bar block w-full rounded-t-sm bg-foreground"
              style={{
                animationDelay: `${index * 120}ms`,
                height: `${bar.value}%`,
              }}
            />
          </div>
          <p className="mt-1 truncate text-center text-[10px] font-medium text-muted-foreground">{bar.label}</p>
        </div>
      ))}
    </div>
  );
}

function getHeroCopy(plane: PlaneKey): HeroCopy {
  if (plane === "admin") {
    return {
      title: "Build smarter\ninnovate faster",
      subtitle: "Build, deploy, and manage future of business.",
    };
  }
  if (plane === "mesh") {
    return {
      title: "Connect teams\nwork together",
      subtitle: "Collaborate seamlessly across organizations and partners.",
    };
  }
  return {
    title: "Operate smarter\nscale faster",
    subtitle: "Everything your business needs, connected.",
  };
}

function buildPreviewScenario(
  plane: PlaneKey,
  slide: MarketingSlide,
  slideIndex: number,
  activeCommand: string,
): PreviewScenario {
  const suffix = String(slideIndex + 1).padStart(2, "0");
  if (plane === "admin") {
    return {
      recordCode: `ADM-${suffix}12`,
      recordState: "Published",
      title: `${slide.label} release desk`,
      status: "Business Technology Platform",
      primaryMetric: "MFA on",
      secondaryMetric: "7 checks",
      signal: {
        kind: "control",
        title: "Platform control",
        value: "0 critical alerts",
        detail: `${activeCommand} is covered by release gates, policies, and runtime checks.`,
        bars: [
          { label: "Policies", value: 82 },
          { label: "Checks", value: 100 },
          { label: "Tenants", value: 76 },
        ],
      },
      stages: ["Model", "Validate", "Release", "Observe"],
    };
  }
  if (plane === "mesh") {
    return {
      recordCode: `MSH-${suffix}73`,
      recordState: "Paid",
      title: `${slide.label} exchange desk`,
      status: "Business Collaboration Network",
      primaryMetric: "99.9% route",
      secondaryMetric: "3 partners",
      signal: {
        kind: "network",
        title: "Collaboration network",
        value: "12 documents exchanged",
        detail: `${activeCommand} is moving across partners, acknowledgements, and exceptions.`,
        bars: [
          { label: "Partners", value: 70 },
          { label: "Docs", value: 100 },
          { label: "Ack", value: 78 },
        ],
      },
      stages: ["Receive", "Map", "Confirm", "Settle"],
    };
  }
  return {
    recordCode: `ERP-${suffix}48`,
    recordState: "Approved",
    title: `${slide.label} operating desk`,
    status: "Business Operating Platform",
    primaryMetric: "98% match",
    secondaryMetric: "4 tasks",
    signal: {
      kind: "workflow",
      title: "Operating flow",
      value: "2 exceptions cleared",
      detail: `${activeCommand} is moving through approval, exception handling, and posting.`,
      bars: [
        { label: "Open", value: 72 },
        { label: "Approved", value: 100 },
        { label: "Posted", value: 68 },
      ],
    },
    stages: ["Intake", "Validate", "Approve", "Post"],
  };
}
