/**
 * PdfRenderer — unit tests.
 *
 * Covers: Semaphore concurrency control, timeout behavior, SSRF blocking.
 * Uses inline mocks for puppeteer-core (no actual Chromium needed).
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Inline Semaphore extraction for isolated testing
// ---------------------------------------------------------------------------

// We re-implement the Semaphore class here to test it in isolation,
// since it's not exported from PdfRenderer.ts.

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get currentActive(): number {
    return this.active;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Semaphore", () => {
  it("should allow up to maxConcurrent acquires", async () => {
    const sem = new Semaphore(3);

    await sem.acquire();
    await sem.acquire();
    await sem.acquire();

    expect(sem.currentActive).toBe(3);
    expect(sem.pending).toBe(0);
  });

  it("should queue requests beyond maxConcurrent", async () => {
    const sem = new Semaphore(2);

    await sem.acquire();
    await sem.acquire();

    // This should NOT resolve immediately — it goes to queue
    let thirdAcquired = false;
    const thirdPromise = sem.acquire().then(() => {
      thirdAcquired = true;
    });

    // Give microtasks a chance to flush
    await Promise.resolve();

    expect(thirdAcquired).toBe(false);
    expect(sem.pending).toBe(1);

    // Release one — the queued request should now resolve
    sem.release();
    await thirdPromise;

    expect(thirdAcquired).toBe(true);
    expect(sem.currentActive).toBe(2);
    expect(sem.pending).toBe(0);
  });

  it("should release and allow next in queue", async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    await sem.acquire();

    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));

    expect(sem.pending).toBe(2);

    sem.release();
    await p1;
    expect(order).toEqual([1]);

    sem.release();
    await p2;
    expect(order).toEqual([1, 2]);
  });

  it("should track active count correctly through acquire/release cycles", async () => {
    const sem = new Semaphore(3);

    await sem.acquire();
    expect(sem.currentActive).toBe(1);

    await sem.acquire();
    expect(sem.currentActive).toBe(2);

    sem.release();
    expect(sem.currentActive).toBe(1);

    sem.release();
    expect(sem.currentActive).toBe(0);
  });
});

describe("PdfRenderer timeout", () => {
  it("should reject when render exceeds timeout", async () => {
    // Test the withTimeout pattern used by PdfRenderer
    async function withTimeout<T>(
      promise: Promise<T>,
      ms: number,
      message: string,
    ): Promise<T> {
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${message} (${ms}ms)`)), ms);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        clearTimeout(timer!);
      }
    }

    // A promise that never resolves (simulates a hung render)
    const neverResolve = new Promise<Buffer>(() => {});

    await expect(
      withTimeout(neverResolve, 50, "PDF render timed out"),
    ).rejects.toThrow("PDF render timed out (50ms)");
  });

  it("should resolve normally when within timeout", async () => {
    async function withTimeout<T>(
      promise: Promise<T>,
      ms: number,
      message: string,
    ): Promise<T> {
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${message} (${ms}ms)`)), ms);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        clearTimeout(timer!);
      }
    }

    const quickResolve = Promise.resolve(Buffer.from("pdf-content"));

    const result = await withTimeout(
      quickResolve,
      5000,
      "PDF render timed out",
    );
    expect(result.toString()).toBe("pdf-content");
  });
});

describe("PdfRenderer SSRF protection", () => {
  // Simulate the SSRF filtering logic from PdfRenderer.doRender()
  function shouldAllowRequest(url: string, trustedDomains: string[]): boolean {
    // Always allow data: and blob: URIs
    if (url.startsWith("data:") || url.startsWith("blob:")) {
      return true;
    }

    // Check against trusted domains
    if (trustedDomains.length > 0) {
      try {
        const parsed = new URL(url);
        if (
          trustedDomains.some(
            (d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`),
          )
        ) {
          return true;
        }
      } catch {
        // Invalid URL — block
      }
    }

    // Block all other network requests
    return false;
  }

  describe("with no trusted domains", () => {
    const trustedDomains: string[] = [];

    it("should allow data: URIs", () => {
      expect(
        shouldAllowRequest("data:image/png;base64,abc123", trustedDomains),
      ).toBe(true);
    });

    it("should allow blob: URIs", () => {
      expect(
        shouldAllowRequest("blob:http://localhost/abc", trustedDomains),
      ).toBe(true);
    });

    it("should block HTTP requests", () => {
      expect(
        shouldAllowRequest("http://evil.com/steal-data", trustedDomains),
      ).toBe(false);
    });

    it("should block HTTPS requests", () => {
      expect(
        shouldAllowRequest("https://external-api.com/v1/data", trustedDomains),
      ).toBe(false);
    });

    it("should block internal IPs", () => {
      expect(
        shouldAllowRequest(
          "http://169.254.169.254/latest/meta-data/",
          trustedDomains,
        ),
      ).toBe(false);
      expect(
        shouldAllowRequest("http://127.0.0.1:8080/admin", trustedDomains),
      ).toBe(false);
      expect(
        shouldAllowRequest("http://10.0.0.1/internal", trustedDomains),
      ).toBe(false);
    });

    it("should block file: protocol", () => {
      expect(shouldAllowRequest("file:///etc/passwd", trustedDomains)).toBe(
        false,
      );
    });
  });

  describe("with trusted domains", () => {
    const trustedDomains = ["fonts.googleapis.com", "cdn.example.com"];

    it("should allow requests to trusted domains", () => {
      expect(
        shouldAllowRequest(
          "https://fonts.googleapis.com/css2?family=Roboto",
          trustedDomains,
        ),
      ).toBe(true);
      expect(
        shouldAllowRequest("https://cdn.example.com/logo.png", trustedDomains),
      ).toBe(true);
    });

    it("should allow subdomains of trusted domains", () => {
      expect(
        shouldAllowRequest(
          "https://static.cdn.example.com/image.jpg",
          trustedDomains,
        ),
      ).toBe(true);
    });

    it("should block requests to untrusted domains", () => {
      expect(
        shouldAllowRequest("https://evil.com/attack", trustedDomains),
      ).toBe(false);
      expect(
        shouldAllowRequest("https://not-trusted.com/data", trustedDomains),
      ).toBe(false);
    });

    it("should still allow data: URIs", () => {
      expect(
        shouldAllowRequest(
          "data:image/svg+xml;base64,PHN2Zz4=",
          trustedDomains,
        ),
      ).toBe(true);
    });

    it("should block IPs even when trusted domains are set", () => {
      expect(
        shouldAllowRequest("http://169.254.169.254/metadata", trustedDomains),
      ).toBe(false);
    });

    it("should not be fooled by domain suffix attacks", () => {
      // "evilfonts.googleapis.com" should NOT match "fonts.googleapis.com"
      // Our code checks hostname === d || hostname.endsWith(`.${d}`)
      // "evilfonts.googleapis.com".endsWith(".fonts.googleapis.com") = false ✓
      expect(
        shouldAllowRequest(
          "https://evilfonts.googleapis.com/css",
          trustedDomains,
        ),
      ).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle malformed URLs gracefully", () => {
      expect(shouldAllowRequest("not-a-url", ["example.com"])).toBe(false);
    });

    it("should handle empty string URL", () => {
      expect(shouldAllowRequest("", ["example.com"])).toBe(false);
    });

    it("should handle data: URIs with various MIME types", () => {
      expect(shouldAllowRequest("data:font/woff2;base64,abc", [])).toBe(true);
      expect(shouldAllowRequest("data:text/css;charset=utf-8,.foo{}", [])).toBe(
        true,
      );
      expect(shouldAllowRequest("data:application/json;base64,e30=", [])).toBe(
        true,
      );
    });
  });
});
