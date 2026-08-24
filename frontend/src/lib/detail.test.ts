import { describe, expect, it } from "vitest";

import type { SiteDetail } from "@/lib/api/types";
import {
  formatAssumptions,
  geocodeChip,
  monthLabel,
  orderMonthly,
  processingChip,
  shouldAutoOpenStages,
} from "@/lib/detail";

function makeDetail(overrides: Partial<SiteDetail> = {}): SiteDetail {
  return {
    id: 1,
    name: "Desert Bloom Solar",
    address: "3737 W Buckeye Rd, Phoenix, AZ 85009",
    latitude: 33.4362,
    longitude: -112.1279,
    geocode_status: "resolved",
    is_active: true,
    resolved_address: "3737 West Buckeye Road, Phoenix, Arizona, United States",
    geocode_error: null,
    geocode_attempted_at: "2026-08-23T19:04:00Z",
    solar_resource_status: "succeeded",
    annual_ghi_kwh_m2_day: 5.6,
    annual_dni_kwh_m2_day: 6.4,
    annual_latitude_tilt_kwh_m2_day: 6.1,
    monthly_solar_data: null,
    solar_resource_error: null,
    solar_resource_attempted_at: "2026-08-23T19:04:00Z",
    pvwatts_status: "succeeded",
    pvwatts_assumptions: null,
    annual_ac_kwh: 179270,
    capacity_factor_percent: 20.5,
    annual_solar_radiation_kwh_m2_day: 6.05,
    monthly_pvwatts_data: null,
    pvwatts_error: null,
    pvwatts_attempted_at: "2026-08-23T19:04:00Z",
    created_at: "2026-08-23T18:00:00Z",
    updated_at: "2026-08-23T19:04:00Z",
    ...overrides,
  };
}

describe("monthLabel", () => {
  it("title-cases a known stored month key", () => {
    expect(monthLabel("jan")).toBe("Jan");
    expect(monthLabel("dec")).toBe("Dec");
  });

  it("falls back to the raw key for an unknown value", () => {
    expect(monthLabel("q1")).toBe("q1");
  });
});

describe("orderMonthly", () => {
  it("returns an empty array when the series is missing", () => {
    expect(orderMonthly(null)).toEqual([]);
  });

  it("sorts entries into canonical month order and drops unknown months", () => {
    const entries = [
      { month: "mar", value: 3 },
      { month: "jan", value: 1 },
      { month: "zzz", value: 9 },
      { month: "feb", value: 2 },
    ];
    expect(orderMonthly(entries).map((e) => e.month)).toEqual(["jan", "feb", "mar"]);
  });
});

describe("geocodeChip / processingChip", () => {
  it("maps geocode statuses to a chip kind and reader-facing word", () => {
    expect(geocodeChip("resolved")).toEqual({ kind: "ok", word: "resolved" });
    expect(geocodeChip("pending")).toEqual({ kind: "run", word: "pending" });
    expect(geocodeChip("unresolved")).toEqual({ kind: "none", word: "no match found" });
    expect(geocodeChip("failed")).toEqual({ kind: "fail", word: "failed" });
  });

  it("maps processing statuses, keeping blocked distinct from failed", () => {
    expect(processingChip("succeeded")).toEqual({ kind: "ok", word: "succeeded" });
    expect(processingChip("pending")).toEqual({ kind: "run", word: "pending" });
    expect(processingChip("blocked")).toEqual({ kind: "block", word: "blocked" });
    expect(processingChip("failed")).toEqual({ kind: "fail", word: "failed" });
  });
});

describe("shouldAutoOpenStages", () => {
  it("stays collapsed only when all three stages succeeded", () => {
    expect(shouldAutoOpenStages(makeDetail())).toBe(false);
  });

  it("opens when any stage failed, is blocked, or is pending", () => {
    expect(shouldAutoOpenStages(makeDetail({ solar_resource_status: "failed" }))).toBe(true);
    expect(shouldAutoOpenStages(makeDetail({ pvwatts_status: "blocked" }))).toBe(true);
    expect(shouldAutoOpenStages(makeDetail({ geocode_status: "pending" }))).toBe(true);
    expect(shouldAutoOpenStages(makeDetail({ geocode_status: "unresolved" }))).toBe(true);
  });
});

describe("formatAssumptions", () => {
  it("returns an empty list when nothing was persisted", () => {
    expect(formatAssumptions(null)).toEqual([]);
  });

  it("renders known keys with human labels, units, and enumerated values", () => {
    const rows = formatAssumptions({
      endpoint: "pvwatts",
      version: "v8",
      system_capacity: 100,
      module_type: 0,
      array_type: 0,
      azimuth: 180,
      tilt: 33.4,
      losses: 14,
      dataset: "nsrdb",
      dc_ac_ratio: 1.2,
      gcr: 0.4,
      inv_eff: 96,
      radius: 100,
    });
    const byLabel = new Map(rows.map((r) => [r.label, r.value]));
    expect(byLabel.get("System capacity")).toBe("100 kW");
    expect(byLabel.get("Module type")).toBe("Standard");
    expect(byLabel.get("Array type")).toBe("Fixed, open rack");
    expect(byLabel.get("Azimuth")).toBe("180°");
    expect(byLabel.get("Tilt")).toBe("33.4° (site latitude, 1 dp)");
    expect(byLabel.get("System losses")).toBe("14%");
    expect(byLabel.get("Inverter efficiency")).toBe("96%");
    expect(byLabel.get("Search radius")).toBe("100 miles");
    expect(byLabel.get("DC/AC ratio")).toBe("1.2");
  });

  it("displays every persisted key, falling back to a humanised label for unknowns", () => {
    const rows = formatAssumptions({ mystery_flag: true, radius: 100 });
    const labels = rows.map((r) => r.label);
    // Nothing persisted is silently dropped.
    expect(labels).toContain("Search radius");
    const unknown = rows.find((r) => r.label === "Mystery flag");
    expect(unknown?.value).toBe("true");
  });
});
