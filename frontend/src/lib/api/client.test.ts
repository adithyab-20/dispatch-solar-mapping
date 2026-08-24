import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiBaseUrl, apiClient } from "@/lib/api/client";
import type { SiteListItem } from "@/lib/api/types";

const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;

function mockFetchOnce(response: Partial<Response> & { json?: () => unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000/api";
});

afterEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiBaseUrl", () => {
  it("reads the configured public base and trims a trailing slash", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://example.test/api/";
    expect(apiBaseUrl()).toBe("http://example.test/api");
  });

  it("falls back to the documented development default", () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    expect(apiBaseUrl()).toBe("http://127.0.0.1:8000/api");
  });
});

describe("apiClient.fetchSites", () => {
  it("requests the sites list against the configured base and returns the rows", async () => {
    const rows: SiteListItem[] = [
      {
        id: 1,
        name: "A",
        address: "1 Main",
        latitude: 40,
        longitude: -105,
        geocode_status: "resolved",
        solar_resource_status: "succeeded",
        annual_ghi_kwh_m2_day: 5.6,
        annual_dni_kwh_m2_day: 6.5,
        annual_latitude_tilt_kwh_m2_day: 6.1,
        pvwatts_status: "succeeded",
        annual_ac_kwh: 179270,
        monthly_pvwatts_data: null,
      },
    ];
    const fetchMock = mockFetchOnce({ json: async () => rows });

    const result = await apiClient.fetchSites();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/sites/");
    expect(result).toEqual(rows);
  });

  it("raises a network ApiError when fetch rejects, without leaking details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED secret host")));
    await expect(apiClient.fetchSites()).rejects.toMatchObject({ kind: "network" });
    await expect(apiClient.fetchSites()).rejects.toBeInstanceOf(ApiError);
  });

  it("raises an http ApiError carrying the status for a non-2xx response", async () => {
    mockFetchOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(apiClient.fetchSites()).rejects.toMatchObject({ kind: "http", status: 503 });
  });

  it("raises a parse ApiError when the body is not JSON", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Unexpected token");
      },
    });
    await expect(apiClient.fetchSites()).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("apiClient site mutations", () => {
  it("sends PATCH edits as JSON and returns the complete detail", async () => {
    const detail = { id: 3, name: "Renamed" };
    const fetchMock = mockFetchOnce({ json: async () => detail });

    const result = await apiClient.updateSite(3, { name: "Renamed" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/sites/3/",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
    expect(result).toEqual(detail);
  });

  it.each([
    ["refreshGeocoding", "/sites/4/geocode/"],
    ["refreshSolarResource", "/sites/4/solar-resource/"],
    ["refreshPvwatts", "/sites/4/pvwatts/"],
  ] as const)("posts %s to its focused endpoint", async (method, path) => {
    const fetchMock = mockFetchOnce({ json: async () => ({ id: 4 }) });

    await apiClient[method](4);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:8000/api${path}`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps a structured validation payload on HTTP errors", async () => {
    const payload = {
      detail: "The PATCH payload is invalid.",
      errors: { address: ["Must be a non-empty string."] },
    };
    mockFetchOnce({ ok: false, status: 400, json: async () => payload });

    await expect(apiClient.updateSite(1, { address: "---" })).rejects.toMatchObject({
      kind: "http",
      status: 400,
      payload,
    });
  });
});
