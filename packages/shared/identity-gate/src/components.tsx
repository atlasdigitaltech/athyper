import { useEffect, useState, type ReactNode } from "react";
import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";
import { getPublicBrandAssets } from "@athyper/brand";

import { getAuthExperience } from "./experience";
import type { AuthLayoutVariant } from "./types";

interface AuthShellProps {
  plane: PlaneKey;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: AuthLayoutVariant;
}

const AUTO_ADVANCE_MS = 5000;
const PLANE_SWITCH_ORDER = ["neon", "mesh", "admin"] as const satisfies readonly PlaneKey[];

type PlaneLinkMode = "local" | "public";

export function AuthShell({
  plane,
  title,
  subtitle,
  children,
  footer,
  variant = "brand",
}: AuthShellProps) {
  const config = getPlaneConfig(plane);
  const experience = getAuthExperience(plane);
  const brandAssets = getPublicBrandAssets(plane);
  const productLabel = `${config.appName} - ${config.productName}`;
  const [planeLinkMode, setPlaneLinkMode] = useState<PlaneLinkMode>("public");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPlaneLinkMode(window.location.hostname.endsWith(".athyper.local") ? "local" : "public");
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

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <style>{`
        @keyframes auth-progress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .auth-mono-left {
          background:
            radial-gradient(circle at 22% 15%, color-mix(in oklab, var(--primary-foreground) 10%, transparent), transparent 28%),
            radial-gradient(circle at 72% 58%, color-mix(in oklab, var(--primary-foreground) 5%, transparent), transparent 30%),
            var(--primary);
          border-right-color: var(--border);
          color: var(--primary-foreground);
        }
        .auth-mono-watermark { color: color-mix(in oklab, var(--primary-foreground) 5%, transparent); }
        .auth-mono-lineage { color: color-mix(in oklab, var(--primary-foreground) 72%, transparent); }
        .auth-mono-eyebrow { color: color-mix(in oklab, var(--primary-foreground) 62%, transparent); }
        .auth-mono-copy { color: color-mix(in oklab, var(--primary-foreground) 70%, transparent); }
        .auth-mono-tag {
          border: 1px solid color-mix(in oklab, var(--primary-foreground) 14%, transparent);
          color: color-mix(in oklab, var(--primary-foreground) 60%, transparent);
        }
        .auth-mono-wall {
          border-top: 1px solid color-mix(in oklab, var(--primary-foreground) 12%, transparent);
        }
        .auth-mono-wall-chip {
          border: 1px solid color-mix(in oklab, var(--primary-foreground) 14%, transparent);
          color: color-mix(in oklab, var(--primary-foreground) 58%, transparent);
        }
        .auth-mono-wall-chip:hover {
          color: color-mix(in oklab, var(--primary-foreground) 82%, transparent);
          border-color: color-mix(in oklab, var(--primary-foreground) 26%, transparent);
        }
        .auth-mono-wall-chip-active {
          background: color-mix(in oklab, var(--primary-foreground) 12%, transparent);
          border-color: color-mix(in oklab, var(--primary-foreground) 36%, transparent);
          color: var(--primary-foreground);
        }
        .auth-mono-progress-track { background: color-mix(in oklab, var(--primary-foreground) 16%, transparent); }
        .auth-mono-progress-bar { background: var(--primary-foreground); }
        .auth-mono-agent-mark {
          background: color-mix(in oklab, var(--primary-foreground) 8%, transparent);
          border: 1px solid color-mix(in oklab, var(--primary-foreground) 18%, transparent);
          color: color-mix(in oklab, var(--primary-foreground) 78%, transparent);
        }
        .auth-mono-footer-copy { color: color-mix(in oklab, var(--primary-foreground) 54%, transparent); }
        .auth-mono-plane-link {
          color: color-mix(in oklab, var(--primary-foreground) 54%, transparent);
        }
        .auth-mono-plane-link:hover {
          color: color-mix(in oklab, var(--primary-foreground) 82%, transparent);
        }
        .auth-mono-primary {
          background: var(--primary);
          color: var(--primary-foreground);
        }
        .auth-mono-primary:hover { background: color-mix(in oklab, var(--primary) 88%, var(--foreground)); }
        .auth-mono-secondary {
          background: var(--background);
          border-color: var(--border);
          color: var(--foreground);
        }
        .auth-mono-secondary:hover { background: var(--muted); }
        .auth-mono-glow {
          background:
            radial-gradient(circle at 18% 18%, color-mix(in oklab, var(--primary-foreground) 14%, transparent), transparent 26%),
            radial-gradient(circle at 82% 32%, color-mix(in oklab, var(--primary-foreground) 8%, transparent), transparent 28%);
        }
        .auth-mono-grid {
          background-image: linear-gradient(135deg, color-mix(in oklab, var(--primary-foreground) 22%, transparent) 1px, transparent 1px);
          background-size: 32px 32px;
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-progress-bar { animation: none !important; transform: scaleX(1); }
        }
      `}</style>
      <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
        <aside
          className="auth-mono-left relative hidden min-h-0 overflow-hidden border-r lg:flex lg:flex-col"
        >
          <div className="auth-mono-glow pointer-events-none absolute inset-0" />
          <div className="auth-mono-grid pointer-events-none absolute inset-0 opacity-[0.08]" />
          <img
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute right-[-4rem] top-1/2 h-[26rem] w-[26rem] -translate-y-1/2 rounded-[3rem] object-cover opacity-[0.05]"
            draggable={false}
            src={brandAssets.appIcon}
          />

          <div className="relative z-10 shrink-0 px-12 pt-7">
            <MarketingPanelLogo plane={plane} />
          </div>

          <div className="relative flex min-h-0 flex-1 items-center px-12 py-5">
            <BrandPanel plane={plane} />
          </div>

          <div className="relative z-10 grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-4 px-12 pb-5">
            <div className="auth-mono-footer-copy flex items-center gap-2 text-xs font-normal">
              <img
                alt=""
                aria-hidden="true"
                className="auth-mono-agent-mark h-5 w-5 rounded-sm object-cover opacity-80"
                draggable={false}
                src={brandAssets.appIcon}
              />
              <span>Powered by ATLAS AI Agent</span>
            </div>
            <PlaneSwitchLinks current={plane} mode={planeLinkMode} />
            <p className="auth-mono-footer-copy text-xs font-normal">{experience.techSignature}</p>
          </div>
        </aside>
        <section
          className="relative flex h-screen min-h-0 flex-col items-center px-5 pb-5 pt-8 sm:px-8"
        >
          <div className="flex w-full max-w-sm flex-1 items-center">
            <div className="w-full space-y-7">
              <div className="flex justify-center lg:hidden">
                <ProductMark plane={plane} />
              </div>
              <div className="space-y-1 text-center lg:text-left">
                <h1 className="text-3xl font-medium">{title}</h1>
                {subtitle ? <p className="text-base text-muted-foreground">{subtitle}</p> : null}
              </div>
              {children}
            </div>
          </div>
          {footer ? <div className="w-full">{footer}</div> : null}
        </section>
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

function MarketingPanelLogo({ plane }: { plane: PlaneKey }) {
  const experience = getAuthExperience(plane);

  return (
    <div className="text-center">
      <div className="auth-mono-lineage whitespace-nowrap text-sm font-medium lowercase">
        {experience.lineage}
      </div>
    </div>
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

function PlaneSwitchLinks({ current, mode }: { current: PlaneKey; mode: PlaneLinkMode }) {
  const targets = PLANE_SWITCH_ORDER.filter((plane) => plane !== current);

  return (
    <nav
      aria-label="Switch application"
      className="auth-mono-footer-copy flex justify-self-center text-xs font-normal"
    >
      {targets.map((target, index) => {
        const targetConfig = getPlaneConfig(target);
        const host = mode === "local" ? targetConfig.localHost : targetConfig.publicHost;
        const label = target === "admin" ? "athyper Admin" : targetConfig.appName;
        return (
          <span key={target} className="flex items-center">
            {index > 0 ? <span className="px-2 opacity-50">·</span> : null}
            <a className="auth-mono-plane-link transition-colors" href={`https://${host}${targetConfig.loginPath}`}>
              {label}
            </a>
          </span>
        );
      })}
    </nav>
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

  useEffect(() => {
    setSlide(0);
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSlide((s) => (s + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [resumeKey, slide, slides.length]);

  const current = slides[slide] ?? slides[0]!;
  const currentNavLabel = current.navLabel ?? current.label;
  const currentEyebrow = plane === "neon" ? `${currentNavLabel} domain` : current.label;

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div key={`${plane}-${slide}`} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <p className="auth-mono-eyebrow text-xs font-medium">{currentEyebrow}</p>
        <h2 className="text-4xl font-medium leading-tight">{current.title}</h2>
        <p className="auth-mono-copy max-w-lg text-base leading-6">{current.body}</p>
        {current.tags ? (
          <div className="flex max-w-xl flex-wrap gap-2 pt-1">
            {current.tags.map((tag) => (
              <span
                key={tag}
                className="auth-mono-tag rounded-full px-2.5 py-0.5 text-sm font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="auth-mono-wall relative max-w-2xl space-y-3 py-4">
        <div className="auth-mono-progress-track absolute left-0 right-0 top-0 h-px overflow-hidden">
          <div
            key={`${plane}-${slide}-${resumeKey}`}
            className="auth-progress-bar auth-mono-progress-bar h-full origin-left"
            style={{
              animation: `auth-progress ${AUTO_ADVANCE_MS}ms linear forwards`,
            }}
          />
        </div>
        <div className="auth-mono-eyebrow flex items-center justify-between text-xs font-medium">
          <span>{experience.domainWallLabel}</span>
          <span>
            {slide + 1} of {slides.length}
          </span>
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
                className={`auth-mono-wall-chip rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  active ? "auth-mono-wall-chip-active" : ""
                }`}
                onClick={() => setSlide(i)}
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
