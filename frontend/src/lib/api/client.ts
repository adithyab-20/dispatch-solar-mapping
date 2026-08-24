import type { SiteDetail, SiteListItem } from "@/lib/api/types";

// The one development default, mirrored by `frontend/.env.local.example` and
// `docs/design-decisions.md` §9.1. Every backend request in the app flows
// through this module so the base URL is configured in exactly one place.
const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api";

export type ApiErrorKind = "network" | "http" | "parse";

/**
 * A safe, categorised transport failure. It deliberately carries no provider
 * body, URL, query string, or raw exception text — only a kind and, for HTTP
 * errors, the status code — so the UI can explain a failure without leaking.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, status?: number) {
    super(`API request failed (${kind}${status ? ` ${status}` : ""})`);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

/** The configured public API base, with any trailing slashes removed. */
export function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  return configured.replace(/\/+$/, "");
}

/** The host of the configured API base, for display in the app bar. */
export function apiOrigin(): string {
  const base = apiBaseUrl();
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}

/** A safe, reader-facing phrase for each transport failure kind. */
export const ERROR_KIND_PHRASE: Record<ApiErrorKind, string> = {
  network: "network error",
  http: "server error",
  parse: "unexpected response",
};

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError("network");
  }

  if (!response.ok) {
    throw new ApiError("http", response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("parse");
  }
}

export const apiClient = {
  /** `GET /api/sites/` — the active-site catalogue for the landing page. */
  fetchSites(): Promise<SiteListItem[]> {
    return getJson<SiteListItem[]>("/sites/");
  },
  /** `GET /api/sites/{id}/` — the complete stored state for one active site. */
  fetchSite(id: number): Promise<SiteDetail> {
    return getJson<SiteDetail>(`/sites/${id}/`);
  },
};

export type ApiClient = typeof apiClient;
