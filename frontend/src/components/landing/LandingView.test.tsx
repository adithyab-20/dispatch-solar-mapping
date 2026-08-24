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

function makeSite(overrides: Partial<SiteListItem> & { id: number }): SiteListItem {
  return {
    name: `Site ${overrides.id}`,
    address: `${overrides.id} Main St`,
    latitude: null,
    longitude: null,
    geocode_status: "pending",
    ...overrides,
  };
}

const CATALOGUE: SiteListItem[] = [
  makeSite({ id: 1, name: "Desert Bloom Solar", geocode_status: "resolved", latitude: 33.43, longitude: -112.12 }),
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
    expect(screen.getAllByText("resolved").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("no match found")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
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
