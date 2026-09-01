import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "@/lib/activity/formatRelativeTime";

const NOW = new Date("2026-09-01T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("shows seconds for under a minute", () => {
    expect(formatRelativeTime(new Date("2026-09-01T11:59:45.000Z").toISOString(), NOW)).toBe("just now");
  });

  it("shows minutes for under an hour", () => {
    expect(formatRelativeTime(new Date("2026-09-01T11:45:00.000Z").toISOString(), NOW)).toBe("15m ago");
  });

  it("shows hours for under a day", () => {
    expect(formatRelativeTime(new Date("2026-09-01T09:00:00.000Z").toISOString(), NOW)).toBe("3h ago");
  });

  it("shows days for under a week", () => {
    expect(formatRelativeTime(new Date("2026-08-30T12:00:00.000Z").toISOString(), NOW)).toBe("2d ago");
  });

  it("falls back to a plain date beyond a week", () => {
    expect(formatRelativeTime(new Date("2026-08-01T12:00:00.000Z").toISOString(), NOW)).toBe(
      new Date("2026-08-01T12:00:00.000Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
  });
});
