import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { LandingView } from "@/components/landing/LandingView";
import { ApiError, apiClient } from "@/lib/api/client";
import type { SiteListItem } from "@/lib/api/types";

// Replace the shared API client (AC: "Frontend tests replace the shared API client").
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiClient: { fetchSites: vi.fn(), fetchSite: vi.fn() },
  };
});

// Replace the Leaflet map panel so eligibility can be asserted without Leaflet.
vi.mock("@/components/landing/MapPanel", () => ({
  MapPanel: ({ sites, unmappedCount }: { sites: SiteListItem[]; unmappedCount: number }) => (
    <div data-testid="map-panel" data-unmapped={unmappedCount}>
      {sites.map((s) => (
        <div key={s.id} data-testid="map-marker" data-site-id={s.id} />
      ))}
    </div>
  ),
}));

const fetchSites = apiClient.fetchSites as unknown as Mock;

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function makeSite(overrides: Partial<SiteListItem> & { id: number }): SiteListItem {
  return {
    name: `Site ${overrides.id}`,
    address: `${overrides.id} Main St`,
    latitude: null,
    longitude: null,
    geocode_status: "pending",
    solar_resource_status: "blocked",
    annual_ghi_kwh_m2_day: null,
    annual_dni_kwh_m2_day: null,
    annual_latitude_tilt_kwh_m2_day: null,
    pvwatts_status: "blocked",
    annual_ac_kwh: null,
    monthly_pvwatts_data: null,
    ...overrides,
  };
}

const RESULTS: Partial<SiteListItem> = {
  solar_resource_status: "succeeded",
  annual_ghi_kwh_m2_day: 5.65,
  annual_dni_kwh_m2_day: 6.58,
  annual_latitude_tilt_kwh_m2_day: 6.1,
  pvwatts_status: "succeeded",
  annual_ac_kwh: 179270,
  monthly_pvwatts_data: MONTH_KEYS.map((month, i) => ({
    month,
    ac_kwh: 10000 + i * 100,
    solar_radiation_kwh_m2_day: 5,
  })),
};

const CATALOGUE: SiteListItem[] = [
  makeSite({ id: 1, name: "Desert Bloom Solar", geocode_status: "resolved", latitude: 33.43, longitude: -112.12, ...RESULTS }),
  makeSite({ id: 2, name: "Front Range PV Yard", geocode_status: "resolved", latitude: 40.02, longitude: -105.25 }),
  makeSite({ id: 3, name: "Piedmont Pending Site", geocode_status: "pending" }),
  makeSite({ id: 4, name: "Nowhere Ranch", geocode_status: "unresolved" }),
  makeSite({ id: 5, name: "Timeout Flats", geocode_status: "failed" }),
];

beforeEach(() => {
  fetchSites.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("LandingView", () => {
  it("shows a loading state before the catalogue resolves", () => {
    fetchSites.mockReturnValue(new Promise(() => {}));
    render(<LandingView />);
    expect(screen.getByText(/loading sites/i)).toBeInTheDocument();
  });

  it("lists every active site, including unmapped ones, with its status word", async () => {
    fetchSites.mockResolvedValue(CATALOGUE);
    render(<LandingView />);

    // Mapped sites appear immediately in the "On the map" group.
    expect(await screen.findByText("Desert Bloom Solar")).toBeInTheDocument();
    expect(screen.getByText("Front Range PV Yard")).toBeInTheDocument();

    // The unmapped group is collapsed by default; open it to read its rows.
    await userEvent.click(screen.getByRole("button", { name: /not on the map/i }));

    expect(screen.getByText("Piedmont Pending Site")).toBeInTheDocument();
    expect(screen.getByText("Nowhere Ranch")).toBeInTheDocument();
    expect(screen.getByText("Timeout Flats")).toBeInTheDocument();

    // Statuses are communicated by word, and "unresolved" reads as "no match found".
    // A resolved row with results shows its production instead of the status word.
    expect(screen.getAllByText("resolved").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("no match found")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("shows annual production on a row with results and irradiance on demand", async () => {
    fetchSites.mockResolvedValue(CATALOGUE);
    render(<LandingView />);

    const row = (await screen.findByText("Desert Bloom Solar")).closest("a")!;
    expect(within(row).getByText("179,270")).toBeInTheDocument();
    expect(within(row).getByText("kWh/yr")).toBeInTheDocument();
    // The irradiance line exists in the row, revealed on hover/focus/selection.
    expect(within(row).getByText("GHI")).toBeInTheDocument();
    expect(within(row).getByText("5.65")).toBeInTheDocument();
    expect(within(row).getByText("kWh/m²/day")).toBeInTheDocument();
  });

  it("marks a resolved row with missing results with a caution note", async () => {
    fetchSites.mockResolvedValue(CATALOGUE);
    render(<LandingView />);

    const row = (await screen.findByText("Front Range PV Yard")).closest("a")!;
    // The note appears as the glyph's accessible title and the mono note line.
    expect(within(row).getAllByText(/solar results missing/).length).toBeGreaterThanOrEqual(1);
  });

  it("collapses the rail to a spine and expands it again", async () => {
    fetchSites.mockResolvedValue(CATALOGUE);
    render(<LandingView />);
    await screen.findByText("Desert Bloom Solar");

    await userEvent.click(screen.getByRole("button", { name: /collapse the site list/i }));
    expect(screen.queryByText("Desert Bloom Solar")).not.toBeInTheDocument();
    expect(screen.getByText(/sites/i, { selector: "aside div" })).toHaveTextContent("5");

    await userEvent.click(screen.getByRole("button", { name: /show the site list/i }));
    expect(screen.getByText("Desert Bloom Solar")).toBeInTheDocument();
  });

  it("keeps the Not on the map group visible even when every site is mapped", async () => {
    fetchSites.mockResolvedValue([CATALOGUE[0], CATALOGUE[1]]);
    render(<LandingView />);
    await screen.findByText("Desert Bloom Solar");

    const toggle = screen.getByRole("button", { name: /not on the map/i });
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/every active site has coordinates/)).toBeInTheDocument();
  });

  it("passes only resolved sites with coordinates to the map", async () => {
    fetchSites.mockResolvedValue(CATALOGUE);
    render(<LandingView />);

    const panel = await screen.findByTestId("map-panel");
    const markers = within(panel).getAllByTestId("map-marker");
    expect(markers.map((m) => m.getAttribute("data-site-id"))).toEqual(["1", "2"]);
    expect(panel).toHaveAttribute("data-unmapped", "3");
  });

  it("links each catalogue row to its detail route", async () => {
    fetchSites.mockResolvedValue(CATALOGUE);
    render(<LandingView />);

    const row = await screen.findByText("Desert Bloom Solar");
    const link = row.closest("a");
    expect(link).toHaveAttribute("href", "/sites/1");
  });

  it("shows the empty-catalogue guidance when no sites exist", async () => {
    fetchSites.mockResolvedValue([]);
    render(<LandingView />);
    expect(await screen.findByText(/no sites yet/i)).toBeInTheDocument();
    expect(screen.getByText(/make import/i)).toBeInTheDocument();
  });

  it("shows a safe error and recovers on retry", async () => {
    fetchSites.mockRejectedValueOnce(new ApiError("http", 503)).mockResolvedValueOnce(CATALOGUE);
    render(<LandingView />);

    expect(await screen.findByText(/could not reach the application api/i)).toBeInTheDocument();
    // The failing request is named without leaking keys, params, or exception text.
    expect(screen.getByText(/GET \/api\/sites\//)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(screen.getByText("Desert Bloom Solar")).toBeInTheDocument());
  });
});
