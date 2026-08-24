import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SiteMap } from "@/components/landing/SiteMap";
import type { SiteListItem } from "@/lib/api/types";

const map = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  invalidateSize: vi.fn(),
  setView: vi.fn(),
}));
const popupLayer = vi.hoisted(() => ({
  closePopup: vi.fn(),
  openPopup: vi.fn(),
}));

vi.mock("leaflet", () => ({
  latLngBounds: vi.fn((points) => points),
}));

vi.mock("react-leaflet", () => ({
  CircleMarker: ({
    children,
    radius,
    pathOptions,
    eventHandlers,
  }: {
    children: ReactNode;
    radius: number;
    pathOptions: { fillColor: string };
    eventHandlers: {
      click?: () => void;
      mouseout?: (event: { target: typeof popupLayer }) => void;
      mouseover?: (event: { target: typeof popupLayer }) => void;
    };
  }) => (
    <button
      type="button"
      data-testid="circle-marker"
      data-radius={radius}
      data-fill={pathOptions.fillColor}
      onClick={() => eventHandlers.click?.()}
      onMouseEnter={() => eventHandlers.mouseover?.({ target: popupLayer })}
      onMouseLeave={() => eventHandlers.mouseout?.({ target: popupLayer })}
    >
      {children}
    </button>
  ),
  MapContainer: ({ children, ...props }: { children: ReactNode; "aria-label": string }) => (
    <div aria-label={props["aria-label"]}>{children}</div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: ({ attribution }: { attribution: string }) => (
    <div data-testid="tile-attribution" data-attribution={attribution} />
  ),
  useMap: () => map,
}));

const SITE: SiteListItem = {
  id: 1,
  name: "Denver Sample Site",
  address: "1437 Bannock Street, Denver, CO 80202",
  latitude: 39.7392,
  longitude: -104.9903,
  geocode_status: "resolved",
  solar_resource_status: "succeeded",
  annual_ghi_kwh_m2_day: 4.83,
  annual_dni_kwh_m2_day: 6.12,
  annual_latitude_tilt_kwh_m2_day: 5.85,
  pvwatts_status: "succeeded",
  annual_ac_kwh: 162946,
  monthly_pvwatts_data: null,
};

beforeEach(() => {
  map.fitBounds.mockReset();
  map.invalidateSize.mockReset();
  map.setView.mockReset();
  popupLayer.closePopup.mockReset();
  popupLayer.openPopup.mockReset();
});

describe("SiteMap", () => {
  it("keeps the legend out of Leaflet's top-left zoom-control corner", () => {
    render(<SiteMap sites={[SITE]} unmappedCount={1} />);

    const legend = screen.getByText("Map shows").parentElement!;
    expect(legend).toHaveStyle({ right: "12px" });
    expect(legend.style.left).toBe("");
  });

  it("keeps map and geocoding attribution together in Leaflet's attribution line", () => {
    render(<SiteMap sites={[SITE]} unmappedCount={0} />);

    const attribution = screen.getByTestId("tile-attribution").getAttribute("data-attribution");
    expect(attribution).toContain("Geocoding");
    expect(attribution).toContain("Nominatim");
    expect(attribution).toContain("OpenStreetMap");
    expect(screen.queryByText("Geocoding © OpenStreetMap / Nominatim")).not.toBeInTheDocument();
  });

  it("places the irradiance unit on its own non-clipping row", () => {
    render(<SiteMap sites={[SITE]} unmappedCount={0} />);

    const unit = screen.getByText("kWh/m²/day");
    expect(unit.parentElement).toHaveStyle({ display: "grid" });
    expect(unit).toHaveStyle({ gridColumn: "1 / -1", whiteSpace: "nowrap" });
  });

  it("resizes without refitting or zooming when the rail layout changes", () => {
    const { rerender } = render(<SiteMap sites={[SITE]} unmappedCount={0} layoutSignal={0} />);
    expect(map.setView).toHaveBeenCalledTimes(1);

    map.invalidateSize.mockClear();
    rerender(<SiteMap sites={[SITE]} unmappedCount={0} layoutSignal={1} />);

    expect(map.setView).toHaveBeenCalledTimes(1);
    expect(map.invalidateSize).toHaveBeenCalledWith({ animate: false, pan: false });
  });

  it("visually emphasizes a marker highlighted from the collapsed rail", () => {
    render(<SiteMap sites={[SITE]} unmappedCount={0} highlightedId={1} />);

    expect(screen.getByTestId("circle-marker")).toHaveAttribute("data-radius", "10");
    expect(screen.getByTestId("circle-marker")).toHaveAttribute("data-fill", "#004d00");
  });

  it("opens site information and coordinates rail highlighting while a marker is hovered", async () => {
    const onHighlight = vi.fn();
    render(<SiteMap sites={[SITE]} unmappedCount={0} onHighlight={onHighlight} />);
    const marker = screen.getByTestId("circle-marker");

    marker.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(popupLayer.openPopup).toHaveBeenCalledOnce();
    expect(onHighlight).toHaveBeenLastCalledWith(1);

    marker.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    expect(popupLayer.closePopup).toHaveBeenCalledOnce();
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });
});
