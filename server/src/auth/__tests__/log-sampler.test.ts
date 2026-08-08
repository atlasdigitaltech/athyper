// server/src/auth/__tests__/log-sampler.test.ts
//
// Phase F unit tests — deterministic clock so burst/sample-rate behaviour is
// reproducible across runs.

import { describe, expect, it } from "vitest";

import { LogSampler } from "@athyper/svc-iam";

class FakeClock {
  t = 0;
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

// ─── Construction ────────────────────────────────────────────────────────────

describe("LogSampler construction", () => {
  it("rejects nonsensical config", () => {
    expect(() => new LogSampler({ windowMs: 0 })).toThrow(/windowMs/);
    expect(() => new LogSampler({ burst: -1 })).toThrow(/burst/);
    expect(() => new LogSampler({ sampleRate: 0 })).toThrow(/sampleRate/);
    expect(() => new LogSampler({ maxKeys: 0 })).toThrow(/maxKeys/);
  });
});

// ─── Burst behaviour ─────────────────────────────────────────────────────────

describe("LogSampler — burst window", () => {
  it("first `burst` events on a key all log", () => {
    const clock = new FakeClock();
    const s = new LogSampler({ burst: 10, sampleRate: 100, now: clock.now });
    for (let i = 0; i < 10; i++) {
      const v = s.decide("key");
      expect(v.shouldLog).toBe(true);
      expect(v.suppressedRun).toBe(0);
      expect(v.windowCount).toBe(i + 1);
    }
  });

  it("event right after burst logs (sample fires at burst+1 to avoid a quiet gap)", () => {
    const clock = new FakeClock();
    const s = new LogSampler({ burst: 10, sampleRate: 100, now: clock.now });
    for (let i = 0; i < 10; i++) s.decide("k");
    const after = s.decide("k");
    expect(after.shouldLog).toBe(true);
    expect(after.windowCount).toBe(11);
  });

  it("after burst+1, events suppress until the next sampleRate-th tick", () => {
    const clock = new FakeClock();
    const s = new LogSampler({ burst: 10, sampleRate: 5, now: clock.now });
    for (let i = 0; i < 11; i++) s.decide("k"); // burst (10) + first post-burst log (1)

    // Next 4 events suppress
    for (let i = 0; i < 4; i++) {
      expect(s.decide("k").shouldLog).toBe(false);
    }
    // 16th event logs (positionPastBurst = 6, (6-1) % 5 == 0)
    const fires = s.decide("k");
    expect(fires.shouldLog).toBe(true);
    expect(fires.suppressedRun).toBe(4);
    expect(fires.windowCount).toBe(16);
  });
});

// ─── Window reset ────────────────────────────────────────────────────────────

describe("LogSampler — window reset", () => {
  it("burst credit is restored when the window expires", () => {
    const clock = new FakeClock();
    const s = new LogSampler({ burst: 3, sampleRate: 100, windowMs: 1000, now: clock.now });

    // Spend the burst
    for (let i = 0; i < 3; i++) expect(s.decide("k").shouldLog).toBe(true);
    // Next event would be in post-burst sampling
    const post = s.decide("k");
    expect(post.windowCount).toBe(4);

    // Advance past the window
    clock.advance(1000);
    const reset = s.decide("k");
    expect(reset.shouldLog).toBe(true);
    expect(reset.windowCount).toBe(1);
  });
});

// ─── Multi-key independence ──────────────────────────────────────────────────

describe("LogSampler — multi-key independence", () => {
  it("two keys exhaust their bursts independently", () => {
    const clock = new FakeClock();
    const s = new LogSampler({ burst: 2, sampleRate: 100, now: clock.now });

    expect(s.decide("a").shouldLog).toBe(true);
    expect(s.decide("a").shouldLog).toBe(true);
    expect(s.decide("a").windowCount).toBe(3); // post-burst territory; first sample fires
    // Now back to suppressing on a
    expect(s.decide("a").shouldLog).toBe(false);

    // b is fresh — burst still available
    expect(s.decide("b").shouldLog).toBe(true);
    expect(s.decide("b").shouldLog).toBe(true);
  });
});

// ─── LRU eviction ────────────────────────────────────────────────────────────

describe("LogSampler — LRU eviction", () => {
  it("drops the oldest key when capacity is hit", () => {
    const clock = new FakeClock();
    const s = new LogSampler({ burst: 1, sampleRate: 100, maxKeys: 3, now: clock.now });

    s.decide("a"); s.decide("b"); s.decide("c");
    expect(s.size()).toBe(3);

    // Touch b and c — a becomes the LRU
    s.decide("b"); s.decide("c");

    // Adding "d" should evict "a"
    s.decide("d");
    expect(s.size()).toBe(3);

    // Re-using "a" → it's a new bucket, so burst applies fresh
    const aAgain = s.decide("a");
    expect(aAgain.shouldLog).toBe(true);
    expect(aAgain.windowCount).toBe(1);
  });
});

// ─── Suppressed run reporting ────────────────────────────────────────────────

describe("LogSampler — suppressed run carries over to next log", () => {
  it("reports the number of suppressed events since the last log", () => {
    const clock = new FakeClock();
    const s = new LogSampler({ burst: 1, sampleRate: 3, now: clock.now });

    expect(s.decide("k").shouldLog).toBe(true); // burst (1)
    expect(s.decide("k").shouldLog).toBe(true); // first post-burst, suppressedRun=0
    expect(s.decide("k").shouldLog).toBe(false); // suppressedRun grows
    expect(s.decide("k").shouldLog).toBe(false);
    const fires = s.decide("k"); // positionPastBurst=4, (4-1)%3==0 → fires
    expect(fires.shouldLog).toBe(true);
    expect(fires.suppressedRun).toBe(2);
  });
});
