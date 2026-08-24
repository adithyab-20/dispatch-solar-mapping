import { describe, expect, it } from "vitest";

import { fmt, formatCoordinates, formatTimestamp } from "@/lib/format";

describe("fmt", () => {
  it("groups thousands and honours the decimal count", () => {
    expect(fmt(179270)).toBe("179,270");
    expect(fmt(6.054, 2)).toBe("6.05");
    expect(fmt(6, 2)).toBe("6.00");
  });
});

describe("formatCoordinates", () => {
  it("formats a coordinate pair to five decimal places", () => {
    expect(formatCoordinates(33.4362, -112.1279)).toBe("33.43620, -112.12790");
  });

  it("returns null when either coordinate is absent", () => {
    expect(formatCoordinates(null, -112)).toBeNull();
    expect(formatCoordinates(33, null)).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("formats an ISO instant as a readable UTC stamp", () => {
    expect(formatTimestamp("2026-08-23T19:04:00Z")).toBe("23 Aug 2026, 19:04 UTC");
  });

  it("returns null when there is no timestamp", () => {
    expect(formatTimestamp(null)).toBeNull();
  });
});
