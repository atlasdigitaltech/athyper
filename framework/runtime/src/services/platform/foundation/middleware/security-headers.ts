/**
 * Security headers middleware
 * Similar to helmet.js but lightweight and customizable
 */

import type { Request, Response, NextFunction } from "express";

export interface SecurityHeadersOptions {
  /**
   * Content Security Policy (CSP)
   */
  contentSecurityPolicy?:
    | {
        directives?: Record<string, string[]>;
        reportOnly?: boolean;
      }
    | false;

  /**
   * X-Frame-Options header
   */
  frameOptions?: "DENY" | "SAMEORIGIN" | false;

  /**
   * X-Content-Type-Options header
   */
  noSniff?: boolean;

  /**
   * X-XSS-Protection header
   */
  xssFilter?: boolean;

  /**
   * Strict-Transport-Security (HSTS) header
   */
  hsts?:
    | {
        maxAge?: number;
        includeSubDomains?: boolean;
        preload?: boolean;
      }
    | false;

  /**
   * Referrer-Policy header
   */
  referrerPolicy?:
    | "no-referrer"
    | "no-referrer-when-downgrade"
    | "origin"
    | "origin-when-cross-origin"
    | "same-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin"
    | "unsafe-url"
    | false;

  /**
   * Permissions-Policy header (formerly Feature-Policy)
   */
  permissionsPolicy?: Record<string, string[]> | false;

  /**
   * Remove X-Powered-By header
   */
  hidePoweredBy?: boolean;

  /**
   * Cross-Origin-Embedder-Policy header
   */
  crossOriginEmbedderPolicy?: "require-corp" | "credentialless" | false;

  /**
   * Cross-Origin-Opener-Policy header
   */
  crossOriginOpenerPolicy?: "same-origin" | "same-origin-allow-popups" | "unsafe-none" | false;

  /**
   * Cross-Origin-Resource-Policy header
   */
  crossOriginResourcePolicy?: "same-origin" | "same-site" | "cross-origin" | false;
}

/**
 * Default security headers configuration
 */
const DEFAULT_OPTIONS: Required<SecurityHeadersOptions> = {
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "font-src": ["'self'", "https:", "data:"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'self'"],
      "img-src": ["'self'", "data:", "https:"],
      "object-src": ["'none'"],
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "https:", "'unsafe-inline'"],
      "upgrade-insecure-requests": [],
    },
    reportOnly: false,
  },
  frameOptions: "SAMEORIGIN",
  noSniff: true,
  xssFilter: true,
  hsts: {
    maxAge: 15552000, // 180 days
    includeSubDomains: true,
    preload: false,
  },
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: {
    accelerometer: ["()"],
    camera: ["()"],
    geolocation: ["()"],
    gyroscope: ["()"],
    magnetometer: ["()"],
    microphone: ["()"],
    payment: ["()"],
    usb: ["()"],
  },
  hidePoweredBy: true,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
};

/**
 * Security headers middleware
 */
export function securityHeaders(
  options: SecurityHeadersOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    // Content Security Policy
    if (config.contentSecurityPolicy !== false) {
      const csp = buildCspHeader(config.contentSecurityPolicy.directives || {});
      const headerName = config.contentSecurityPolicy.reportOnly
        ? "Content-Security-Policy-Report-Only"
        : "Content-Security-Policy";
      res.setHeader(headerName, csp);
    }

    // X-Frame-Options
    if (config.frameOptions !== false) {
      res.setHeader("X-Frame-Options", config.frameOptions);
    }

    // X-Content-Type-Options
    if (config.noSniff) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    }

    // X-XSS-Protection
    if (config.xssFilter) {
      res.setHeader("X-XSS-Protection", "1; mode=block");
    }

    // Strict-Transport-Security
    if (config.hsts !== false) {
      const hstsValue = buildHstsHeader(config.hsts);
      res.setHeader("Strict-Transport-Security", hstsValue);
    }

    // Referrer-Policy
    if (config.referrerPolicy !== false) {
      res.setHeader("Referrer-Policy", config.referrerPolicy);
    }

    // Permissions-Policy
    if (config.permissionsPolicy !== false) {
      const permissionsPolicy = buildPermissionsPolicyHeader(config.permissionsPolicy);
      res.setHeader("Permissions-Policy", permissionsPolicy);
    }

    // Remove X-Powered-By
    if (config.hidePoweredBy) {
      res.removeHeader("X-Powered-By");
    }

    // Cross-Origin-Embedder-Policy
    if (config.crossOriginEmbedderPolicy !== false) {
      res.setHeader("Cross-Origin-Embedder-Policy", config.crossOriginEmbedderPolicy);
    }

    // Cross-Origin-Opener-Policy
    if (config.crossOriginOpenerPolicy !== false) {
      res.setHeader("Cross-Origin-Opener-Policy", config.crossOriginOpenerPolicy);
    }

    // Cross-Origin-Resource-Policy
    if (config.crossOriginResourcePolicy !== false) {
      res.setHeader("Cross-Origin-Resource-Policy", config.crossOriginResourcePolicy);
    }

    next();
  };
}

/**
 * Build Content Security Policy header value
 */
function buildCspHeader(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) {
        return key;
      }
      return `${key} ${values.join(" ")}`;
    })
    .join("; ");
}

/**
 * Build HSTS header value
 */
function buildHstsHeader(
  options: Exclude<NonNullable<SecurityHeadersOptions["hsts"]>, false>
): string {
  const parts = [`max-age=${options.maxAge}`];

  if (options.includeSubDomains) {
    parts.push("includeSubDomains");
  }

  if (options.preload) {
    parts.push("preload");
  }

  return parts.join("; ");
}

/**
 * Build Permissions-Policy header value
 */
function buildPermissionsPolicyHeader(policies: Record<string, string[]>): string {
  return Object.entries(policies)
    .map(([feature, allowlist]) => {
      if (allowlist.length === 0 || (allowlist.length === 1 && allowlist[0] === "()")) {
        return `${feature}=()`;
      }
      return `${feature}=(${allowlist.join(" ")})`;
    })
    .join(", ");
}

/**
 * Strict security headers for production
 */
export function strictSecurityHeaders(): ReturnType<typeof securityHeaders> {
  return securityHeaders({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'none'"],
        "base-uri": ["'self'"],
        "connect-src": ["'self'"],
        "font-src": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
        "frame-src": ["'none'"],
        "img-src": ["'self'", "data:"],
        "manifest-src": ["'self'"],
        "media-src": ["'self'"],
        "object-src": ["'none'"],
        "script-src": ["'self'"],
        "script-src-attr": ["'none'"],
        "style-src": ["'self'"],
        "worker-src": ["'self'"],
        "upgrade-insecure-requests": [],
      },
    },
    frameOptions: "DENY",
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: "no-referrer",
    crossOriginEmbedderPolicy: "require-corp",
    crossOriginOpenerPolicy: "same-origin",
    crossOriginResourcePolicy: "same-origin",
  });
}

/**
 * Relaxed security headers for development
 */
export function devSecurityHeaders(): ReturnType<typeof securityHeaders> {
  return securityHeaders({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "ws:", "wss:"],
      },
    },
    hsts: false,
  });
}

/**
 * API-specific security headers (less restrictive CSP)
 */
export function apiSecurityHeaders(): ReturnType<typeof securityHeaders> {
  return securityHeaders({
    contentSecurityPolicy: false, // APIs typically don't need CSP
    frameOptions: "DENY",
    referrerPolicy: "no-referrer",
    crossOriginResourcePolicy: "cross-origin", // Allow cross-origin API access
  });
}

/**
 * CORS middleware with security considerations
 */
export function corsHeaders(options: {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    // Handle Origin
    if (options.origin) {
      if (typeof options.origin === "string") {
        res.setHeader("Access-Control-Allow-Origin", options.origin);
      } else if (Array.isArray(options.origin)) {
        if (origin && options.origin.includes(origin)) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
      } else if (typeof options.origin === "function") {
        if (origin && options.origin(origin)) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
      }
    }

    // Handle Methods
    if (options.methods) {
      res.setHeader("Access-Control-Allow-Methods", options.methods.join(", "));
    }

    // Handle Allowed Headers
    if (options.allowedHeaders) {
      res.setHeader("Access-Control-Allow-Headers", options.allowedHeaders.join(", "));
    }

    // Handle Exposed Headers
    if (options.exposedHeaders) {
      res.setHeader("Access-Control-Expose-Headers", options.exposedHeaders.join(", "));
    }

    // Handle Credentials
    if (options.credentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // Handle Max Age
    if (options.maxAge) {
      res.setHeader("Access-Control-Max-Age", options.maxAge.toString());
    }

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
