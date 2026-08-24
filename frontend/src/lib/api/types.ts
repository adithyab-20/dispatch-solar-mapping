// Shapes returned by the backend read API. These mirror
// `backend/sites/serializers.py` exactly; the frontend never invents fields.

export type GeocodeStatus = "pending" | "resolved" | "unresolved" | "failed";

export type ProcessingStatus = "blocked" | "pending" | "succeeded" | "failed";

/** One row of `GET /api/sites/` — the landing catalogue. */
export interface SiteListItem {
  id: number;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geocode_status: GeocodeStatus;
}

export interface MonthlySolarEntry {
  month: string;
  ghi_kwh_m2_day: number;
  dni_kwh_m2_day: number;
  latitude_tilt_kwh_m2_day: number;
}

export interface MonthlyPvwattsEntry {
  month: string;
  ac_kwh: number;
  solar_radiation_kwh_m2_day: number;
}

/** The complete stored state from `GET /api/sites/{id}/`. */
export interface SiteDetail extends SiteListItem {
  is_active: boolean;
  resolved_address: string | null;
  geocode_error: string | null;
  geocode_attempted_at: string | null;
  solar_resource_status: ProcessingStatus;
  annual_ghi_kwh_m2_day: number | null;
  annual_dni_kwh_m2_day: number | null;
  annual_latitude_tilt_kwh_m2_day: number | null;
  monthly_solar_data: MonthlySolarEntry[] | null;
  solar_resource_error: string | null;
  solar_resource_attempted_at: string | null;
  pvwatts_status: ProcessingStatus;
  pvwatts_assumptions: Record<string, unknown> | null;
  annual_ac_kwh: number | null;
  capacity_factor_percent: number | null;
  annual_solar_radiation_kwh_m2_day: number | null;
  monthly_pvwatts_data: MonthlyPvwattsEntry[] | null;
  pvwatts_error: string | null;
  pvwatts_attempted_at: string | null;
  created_at: string;
  updated_at: string;
}
