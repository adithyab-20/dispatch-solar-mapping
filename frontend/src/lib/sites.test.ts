import { describe, expect, it } from "vitest";

import type { SiteListItem } from "@/lib/api/types";
import {
  geocodeStatusMeta,
  hasCoordinates,
  isMappable,
  partitionSites,
  unmappedSummary,
} from "@/lib/sites";

function site(overrides: Partial<SiteListItem>): SiteListItem {
  return {
    id: 1,
    name: "A Site",
    address: "1 Main St",
    latitude: null,
    longitude: null,
    geocode_status: "pending",
    ...overrides,
  };
}

describe("hasCoordinates", () => {
  it("is true only when both coordinates are present, treating 0 as present", () => {
    expect(hasCoordinates(site({ latitude: 0, longitude: 0 }))).toBe(true);
    expect(hasCoordinates(site({ latitude: 40, longitude: null }))).toBe(false);
    expect(hasCoordinates(site({ latitude: null, longitude: null }))).toBe(false);
  });
});

describe("isMappable", () => {
  it("is true only when resolved with both coordinates present", () => {
    expect(
      isMappable(site({ geocode_status: "resolved", latitude: 40, longitude: -105 })),
    ).toBe(true);
  });

  it("is false for a resolved row that is somehow missing a coordinate", () => {
    expect(
      isMappable(site({ geocode_status: "resolved", latitude: 40, longitude: null })),
    ).toBe(false);
    expect(
      isMappable(site({ geocode_status: "resolved", latitude: null, longitude: -105 })),
    ).toBe(false);
  });

  it("treats latitude/longitude of 0 as present, not missing", () => {
    expect(
      isMappable(site({ geocode_status: "resolved", latitude: 0, longitude: 0 })),
    ).toBe(true);
  });

  it("is false for every non-resolved status", () => {
    for (const status of ["pending", "unresolved", "failed"] as const) {
      expect(isMappable(site({ geocode_status: status }))).toBe(false);
    }
  });
});

describe("partitionSites", () => {
  it("splits mappable from unmapped while preserving import order", () => {
    const sites = [
      site({ id: 1, geocode_status: "resolved", latitude: 40, longitude: -105 }),
      site({ id: 2, geocode_status: "pending" }),
      site({ id: 3, geocode_status: "resolved", latitude: 33, longitude: -112 }),
      site({ id: 4, geocode_status: "failed" }),
    ];
    const { mapped, unmapped } = partitionSites(sites);
    expect(mapped.map((s) => s.id)).toEqual([1, 3]);
    expect(unmapped.map((s) => s.id)).toEqual([2, 4]);
  });
});

describe("geocodeStatusMeta", () => {
  it("labels unresolved as 'no match found' and never as an error tone", () => {
    const meta = geocodeStatusMeta("unresolved");
    expect(meta.word).toBe("no match found");
    expect(meta.tone).not.toBe("fail");
    expect(meta.shape).toBe("dashed-ring");
  });

  it("uses distinct shapes and words for each status", () => {
    expect(geocodeStatusMeta("resolved")).toMatchObject({ word: "resolved", shape: "disc" });
    expect(geocodeStatusMeta("pending")).toMatchObject({ word: "pending", shape: "arc" });
    expect(geocodeStatusMeta("failed")).toMatchObject({ word: "failed", shape: "cross", tone: "fail" });
  });
});

describe("unmappedSummary", () => {
  it("counts each unmapped category and omits empty ones", () => {
    const unmapped = [
      site({ id: 2, geocode_status: "pending" }),
      site({ id: 4, geocode_status: "unresolved" }),
      site({ id: 5, geocode_status: "failed" }),
      site({ id: 6, geocode_status: "unresolved" }),
    ];
    expect(unmappedSummary(unmapped)).toBe("1 pending · 2 no match · 1 failed");
  });

  it("is empty for an empty list", () => {
    expect(unmappedSummary([])).toBe("");
  });
});
