import { describe, expect, it } from "vitest";
import { timeOfDayGreeting } from "./hero";

describe("timeOfDayGreeting", () => {
  it("returns morning between 05:00 and 11:59", () => {
    expect(timeOfDayGreeting(new Date("2026-07-26T05:00:00"))).toBe("Good morning");
    expect(timeOfDayGreeting(new Date("2026-07-26T08:30:00"))).toBe("Good morning");
    expect(timeOfDayGreeting(new Date("2026-07-26T11:59:59"))).toBe("Good morning");
  });

  it("returns afternoon between 12:00 and 16:59", () => {
    expect(timeOfDayGreeting(new Date("2026-07-26T12:00:00"))).toBe("Good afternoon");
    expect(timeOfDayGreeting(new Date("2026-07-26T15:15:00"))).toBe("Good afternoon");
    expect(timeOfDayGreeting(new Date("2026-07-26T16:59:59"))).toBe("Good afternoon");
  });

  it("returns evening from 17:00 through 04:59", () => {
    expect(timeOfDayGreeting(new Date("2026-07-26T17:00:00"))).toBe("Good evening");
    expect(timeOfDayGreeting(new Date("2026-07-26T22:00:00"))).toBe("Good evening");
    expect(timeOfDayGreeting(new Date("2026-07-26T00:30:00"))).toBe("Good evening");
    expect(timeOfDayGreeting(new Date("2026-07-26T04:59:59"))).toBe("Good evening");
  });
});
