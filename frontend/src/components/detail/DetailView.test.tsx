import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { DetailView } from "@/components/detail/DetailView";
import { ApiError, apiClient } from "@/lib/api/client";
import type { SiteDetail } from "@/lib/api/types";
import { MONTH_ORDER } from "@/lib/detail";

// Replace the shared API client (AC: "Frontend tests replace the shared API client").
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiClient: { fetchSites: vi.fn(), fetchSite: vi.fn() },
  };
});

const fetchSite = apiClient.fetchSite as unknown as Mock;

// Monthly production peaking in August, so "Best month" resolves to Aug.
const AC = [10350, 11860, 14510, 15830, 16780, 16940, 17690, 18260, 17420, 15880, 12510, 11240];
const RAD = [3.72, 4.42, 5.63, 6.55, 6.87, 7.21, 8.02, 7.94, 7.28, 6.13, 4.86, 4.02];
const GHI = [3.18, 3.86, 5.02, 6.12, 6.68, 7.12, 7.94, 7.62, 6.85, 5.62, 4.34, 3.42];
const DNI = [4.98, 5.62, 6.44, 6.98, 6.72, 7.05, 8.42, 7.96, 7.35, 6.42, 5.86, 5.21];
const TIL = [4.78, 5.44, 6.4, 6.72, 6.44, 6.32, 6.75, 6.82, 6.68, 6.24, 5.62, 5.02];

const monthlyPvwatts = MONTH_ORDER.map((month, i) => ({
  month,
  ac_kwh: AC[i],
  solar_radiation_kwh_m2_day: RAD[i],
}));
const monthlySolar = MONTH_ORDER.map((month, i) => ({
  month,
  ghi_kwh_m2_day: GHI[i],
  dni_kwh_m2_day: DNI[i],
  latitude_tilt_kwh_m2_day: TIL[i],
}));

function makeDetail(overrides: Partial<SiteDetail> = {}): SiteDetail {
  return {
    id: 1,
    name: "Desert Bloom Solar",
    address: "3737 W Buckeye Rd, Phoenix, AZ 85009",
    latitude: 33.4362,
    longitude: -112.1279,
    geocode_status: "resolved",
    is_active: true,
    resolved_address: "3737 West Buckeye Road, Phoenix, Arizona, 85009, United States",
    geocode_error: null,
    geocode_attempted_at: "2026-08-23T19:04:00Z",
    solar_resource_status: "succeeded",
    annual_ghi_kwh_m2_day: 5.6,
    annual_dni_kwh_m2_day: 6.58,
    annual_latitude_tilt_kwh_m2_day: 6.1,
    monthly_solar_data: monthlySolar,
    solar_resource_error: null,
    solar_resource_attempted_at: "2026-08-23T19:04:00Z",
    pvwatts_status: "succeeded",
    pvwatts_assumptions: {
      endpoint: "pvwatts",
      version: "v8",
      system_capacity: 100,
      module_type: 0,
      array_type: 0,
      azimuth: 180,
      tilt: 33.4,
      losses: 14,
      dataset: "nsrdb",
      timeframe: "monthly",
      dc_ac_ratio: 1.2,
      gcr: 0.4,
      inv_eff: 96,
      radius: 100,
      lat: 33.4362,
      lon: -112.1279,
    },
    annual_ac_kwh: 179270,
    capacity_factor_percent: 20.5,
    annual_solar_radiation_kwh_m2_day: 6.05,
    monthly_pvwatts_data: monthlyPvwatts,
    pvwatts_error: null,
    pvwatts_attempted_at: "2026-08-23T19:04:00Z",
    created_at: "2026-08-23T18:00:00Z",
    updated_at: "2026-08-23T19:04:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  fetchSite.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DetailView — complete result", () => {
  it("fetches the requested site through the shared client", async () => {
    fetchSite.mockResolvedValue(makeDetail());
    render(<DetailView siteId={1} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });
    expect(fetchSite).toHaveBeenCalledWith(1);
  });

  it("shows identity, addresses, and coordinates", async () => {
    fetchSite.mockResolvedValue(makeDetail());
    render(<DetailView siteId={1} />);

    expect(await screen.findByRole("heading", { name: "Desert Bloom Solar" })).toBeInTheDocument();
    expect(screen.getByText(/Site #1 · active/)).toBeInTheDocument();
    expect(screen.getByText("3737 W Buckeye Rd, Phoenix, AZ 85009")).toBeInTheDocument();
    expect(
      screen.getByText("3737 West Buckeye Road, Phoenix, Arizona, 85009, United States"),
    ).toBeInTheDocument();
    expect(screen.getByText("33.43620, -112.12790")).toBeInTheDocument();
  });

  it("shows unit-explicit annual PVWatts figures", async () => {
    fetchSite.mockResolvedValue(makeDetail());
    render(<DetailView siteId={1} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });

    // Appears as the hero figure and again as the table's annual total.
    expect(screen.getAllByText("179,270").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("kWh / year")).toBeInTheDocument();
    expect(screen.getByText("Capacity factor")).toBeInTheDocument();
    expect(screen.getByText("20.5")).toBeInTheDocument();
    // Best month is the AC peak (August); it is also the chart's peak label.
    expect(screen.getByText("Best month")).toBeInTheDocument();
    expect(screen.getAllByText("Aug").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the solar resource annual averages with irradiance units", async () => {
    fetchSite.mockResolvedValue(makeDetail());
    render(<DetailView siteId={1} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });

    expect(screen.getByText("Global horizontal irradiance")).toBeInTheDocument();
    expect(screen.getByText("Direct normal irradiance")).toBeInTheDocument();
    expect(screen.getByText("Latitude-tilt irradiance")).toBeInTheDocument();
    expect(screen.getAllByText(/kWh \/ m² \/ day/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the monthly chart and its backing table with all twelve months", async () => {
    fetchSite.mockResolvedValue(makeDetail());
    render(<DetailView siteId={1} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });

    // The chart is present and labelled.
    expect(
      screen.getByRole("img", { name: /monthly ac production in kilowatt-hours/i }),
    ).toBeInTheDocument();

    // The backing table lists every value — the chart is never the only source.
    const acTable = screen.getByText(/monthly ac production and solar radiation/i).closest("table")!;
    expect(within(acTable).getByRole("row", { name: /AC production/ })).toBeInTheDocument();
    expect(within(acTable).getByText("18,260")).toBeInTheDocument(); // August peak
  });

  it("moves the chart tooltip with the arrow keys and announces the value", async () => {
    fetchSite.mockResolvedValue(makeDetail());
    render(<DetailView siteId={1} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });

    const chart = screen.getByRole("img", { name: /monthly ac production in kilowatt-hours/i });
    chart.focus();
    await userEvent.keyboard("{ArrowRight}");
    const live = document.querySelector('[role="status"][aria-live="polite"]');
    expect(live?.textContent).toMatch(/Jan: 10,350 kWh/);
  });

  it("displays every persisted PVWatts assumption in the reproducibility section", async () => {
    fetchSite.mockResolvedValue(makeDetail());
    render(<DetailView siteId={1} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });

    expect(screen.getByText(/Reproducibility — persisted PVWatts assumptions/)).toBeInTheDocument();
    expect(screen.getByText("System capacity")).toBeInTheDocument();
    expect(screen.getByText("100 kW")).toBeInTheDocument();
    expect(screen.getByText("Array type")).toBeInTheDocument();
    expect(screen.getByText("Fixed, open rack")).toBeInTheDocument();
    expect(screen.getByText("Tilt")).toBeInTheDocument();
    expect(screen.getByText("33.4° (site latitude, 1 dp)")).toBeInTheDocument();
    // The reproducibility notes state that secrets are never persisted or shown.
    expect(
      screen.getByText(/API key, URLs and query parameters are never stored or shown/),
    ).toBeInTheDocument();
  });

  it("shows the geocoding attribution separately from the tile attribution", async () => {
    fetchSite.mockResolvedValue(makeDetail());
    render(<DetailView siteId={1} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });

    expect(screen.getByText("Geocoding © OpenStreetMap / Nominatim")).toBeInTheDocument();
    expect(screen.getByText("Map tiles © OpenStreetMap contributors")).toBeInTheDocument();
  });

  it("keeps the processing stages folded while all three stages succeeded", async () => {
    fetchSite.mockResolvedValue(makeDetail());
    render(<DetailView siteId={1} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });

    const toggle = screen.getByRole("button", { name: /processing stages/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Stage detail lines are hidden until expanded.
    expect(screen.queryByText(/coordinates are shown above/i)).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByText(/coordinates are shown above/i)).toBeInTheDocument();
  });
});

describe("DetailView — honest states", () => {
  it("blocks solar and PVWatts and shows no coordinates when geocoding is unresolved", async () => {
    fetchSite.mockResolvedValue(
      makeDetail({
        geocode_status: "unresolved",
        latitude: null,
        longitude: null,
        resolved_address: null,
        solar_resource_status: "blocked",
        solar_resource_attempted_at: null,
        monthly_solar_data: null,
        annual_ghi_kwh_m2_day: null,
        annual_dni_kwh_m2_day: null,
        annual_latitude_tilt_kwh_m2_day: null,
        pvwatts_status: "blocked",
        pvwatts_attempted_at: null,
        pvwatts_assumptions: null,
        monthly_pvwatts_data: null,
        annual_ac_kwh: null,
        capacity_factor_percent: null,
        annual_solar_radiation_kwh_m2_day: null,
      }),
    );
    render(<DetailView siteId={6} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });

    // The chip shows in the location strip and again in the opened stage card.
    expect(screen.getAllByText("no match found").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("— · —")).toBeInTheDocument();
    expect(screen.getAllByText(/Blocked — no data was requested/).length).toBe(2);
    // No fake successful figures anywhere.
    expect(screen.queryByText("kWh / year")).not.toBeInTheDocument();
    // The stages panel opened itself.
    expect(screen.getByRole("button", { name: /processing stages/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows a failed stage with its safe error and last-attempted time (partial success)", async () => {
    fetchSite.mockResolvedValue(
      makeDetail({
        solar_resource_status: "failed",
        solar_resource_error: "The solar resource service did not respond in time. No values were stored.",
        monthly_solar_data: null,
        annual_ghi_kwh_m2_day: null,
        annual_dni_kwh_m2_day: null,
        annual_latitude_tilt_kwh_m2_day: null,
      }),
    );
    render(<DetailView siteId={4} />);
    await screen.findByRole("heading", { name: "Desert Bloom Solar" });

    // PVWatts still stands in full.
    expect(screen.getAllByText("179,270").length).toBeGreaterThanOrEqual(1);
    // The failed stage is isolated with its safe message and timestamp.
    expect(screen.getByText(/Partial result/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/did not respond in time/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Last attempted 23 Aug 2026, 19:04 UTC/).length).toBeGreaterThanOrEqual(1);
  });
});

describe("DetailView — loading, error, and not-found", () => {
  it("shows a loading state before the record resolves", () => {
    fetchSite.mockReturnValue(new Promise(() => {}));
    render(<DetailView siteId={1} />);
    expect(screen.getByText(/loading site/i)).toBeInTheDocument();
    // A way back is retained even while loading.
    expect(screen.getByRole("link", { name: /all sites/i })).toBeInTheDocument();
  });

  it("shows the not-found response for an unknown or deactivated id (404)", async () => {
    fetchSite.mockRejectedValue(new ApiError("http", 404));
    render(<DetailView siteId={999} />);
    expect(await screen.findByText(/site not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to all sites/i })).toBeInTheDocument();
  });

  it("shows not-found for a non-numeric id without calling the API", () => {
    render(<DetailView siteId={null} />);
    expect(screen.getByText(/site not found/i)).toBeInTheDocument();
    expect(fetchSite).not.toHaveBeenCalled();
  });

  it("shows a safe API error and recovers on retry", async () => {
    fetchSite.mockRejectedValueOnce(new ApiError("network")).mockResolvedValueOnce(makeDetail());
    render(<DetailView siteId={1} />);

    expect(await screen.findByText(/could not reach the application api/i)).toBeInTheDocument();
    expect(screen.getByText(/GET \/api\/sites\/1\//)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Desert Bloom Solar" })).toBeInTheDocument());
  });
});
