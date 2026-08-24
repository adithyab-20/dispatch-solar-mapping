import json
import logging
import math
from dataclasses import dataclass
from typing import Final, Never

import requests
from django.conf import settings
from django.utils import timezone

from sites.models import GeocodeStatus, ProcessingStatus, Site
from sites.services.constants import MONTHS

logger = logging.getLogger(__name__)

PVWATTS_ENDPOINT_PATH = "/api/pvwatts/v8.json"
PVWATTS_TIMEOUT_SECONDS = 10
PVWATTS_SESSION = requests.Session()

PVWATTS_BASE_ASSUMPTIONS: Final[dict[str, float | int | str]] = {
    "system_capacity": 100,
    "module_type": 0,
    "array_type": 0,
    "azimuth": 180,
    "losses": 14,
    "dataset": "nsrdb",
    "timeframe": "monthly",
    "dc_ac_ratio": 1.2,
    "gcr": 0.4,
    "inv_eff": 96,
    "radius": 100,
}
PVWATTS_NO_CLIMATE_DATA_ERROR = "PVWatts found no climate data within 100 miles"


@dataclass(frozen=True)
class PVWattsResult:
    annual_ac_kwh: float
    capacity_factor_percent: float
    annual_solar_radiation_kwh_m2_day: float
    monthly_pvwatts_data: list[dict[str, str | float]]
    warning_count: int


class UnexpectedPVWattsResponse(ValueError):
    pass


class PVWattsProviderError(ValueError):
    def __init__(self, error_count: int, *, no_climate_data: bool) -> None:
        self.error_count = error_count
        self.no_climate_data = no_climate_data
        super().__init__("PVWatts provider reported an error")


def _reject_non_standard_json_constant(_: str) -> Never:
    raise UnexpectedPVWattsResponse


def _assumptions(latitude: float, longitude: float) -> dict[str, float | int | str]:
    return {
        **PVWATTS_BASE_ASSUMPTIONS,
        "tilt": round(latitude, 1),
        "lat": latitude,
        "lon": longitude,
    }


def request_pvwatts(
    *,
    assumptions: dict[str, float | int | str],
    api_key: str,
) -> requests.Response:
    endpoint = f"{settings.NLR_API_BASE.rstrip('/')}{PVWATTS_ENDPOINT_PATH}"
    return PVWATTS_SESSION.get(
        endpoint,
        params={**assumptions, "api_key": api_key},
        timeout=PVWATTS_TIMEOUT_SECONDS,
    )


def run_pvwatts(site: Site) -> None:
    latitude = site.latitude
    longitude = site.longitude
    if (
        site.geocode_status != GeocodeStatus.RESOLVED
        or latitude is None
        or longitude is None
    ):
        return

    _persist_pending(site)
    api_key = settings.NLR_API_KEY
    if not isinstance(api_key, str) or not api_key.strip():
        _persist_failure(site, "NLR_API_KEY not configured")
        return

    assumptions = _assumptions(latitude, longitude)
    try:
        response = request_pvwatts(assumptions=assumptions, api_key=api_key)
    except requests.Timeout:
        _persist_failure(site, f"PVWatts timed out after {PVWATTS_TIMEOUT_SECONDS}s")
        return
    except requests.ConnectionError:
        _persist_failure(site, "PVWatts service is unavailable")
        return
    except requests.RequestException:
        _persist_failure(site, "PVWatts request failed")
        return

    if response.status_code == 429:
        _persist_failure(site, "NLR rate limit exceeded - retry in about an hour")
        return
    if not 200 <= response.status_code < 300:
        if _response_reports_no_climate_data(response.text):
            _persist_failure(site, PVWATTS_NO_CLIMATE_DATA_ERROR)
        else:
            _persist_failure(
                site,
                f"PVWatts service returned HTTP {response.status_code}",
            )
        return

    try:
        result = parse_pvwatts_response(response.text)
    except PVWattsProviderError as error:
        logger.warning(
            "PVWatts provider reported %d error(s) for site %s.",
            error.error_count,
            site.pk,
        )
        safe_error = (
            PVWATTS_NO_CLIMATE_DATA_ERROR
            if error.no_climate_data
            else "PVWatts provider reported an error"
        )
        _persist_failure(site, safe_error)
        return
    except UnexpectedPVWattsResponse:
        logger.warning(
            "PVWatts returned an unexpected response for site %s.",
            site.pk,
        )
        _persist_failure(site, "PVWatts returned an unexpected response")
        return

    if result.warning_count:
        logger.warning(
            "PVWatts returned %d warning(s) for site %s.",
            result.warning_count,
            site.pk,
        )
    _persist_success(site, assumptions, result)


def parse_pvwatts_response(response_text: str) -> PVWattsResult:
    if not isinstance(response_text, str):
        raise UnexpectedPVWattsResponse
    try:
        payload = json.loads(
            response_text,
            parse_constant=_reject_non_standard_json_constant,
        )
    except json.JSONDecodeError as error:
        raise UnexpectedPVWattsResponse from error
    if not isinstance(payload, dict):
        raise UnexpectedPVWattsResponse

    errors = payload.get("errors", [])
    if not isinstance(errors, list):
        raise UnexpectedPVWattsResponse
    if errors:
        raise PVWattsProviderError(
            len(errors),
            no_climate_data=_errors_report_no_climate_data(errors),
        )

    warnings = payload.get("warnings", [])
    if not isinstance(warnings, list):
        raise UnexpectedPVWattsResponse

    outputs = payload.get("outputs")
    if not isinstance(outputs, dict):
        raise UnexpectedPVWattsResponse

    ac_monthly = _parse_months(outputs.get("ac_monthly"))
    solar_radiation_monthly = _parse_months(outputs.get("solrad_monthly"))
    return PVWattsResult(
        annual_ac_kwh=_parse_number(outputs.get("ac_annual")),
        capacity_factor_percent=_parse_number(outputs.get("capacity_factor")),
        annual_solar_radiation_kwh_m2_day=_parse_number(outputs.get("solrad_annual")),
        monthly_pvwatts_data=[
            {
                "month": month,
                "ac_kwh": ac_monthly[index],
                "solar_radiation_kwh_m2_day": solar_radiation_monthly[index],
            }
            for index, month in enumerate(MONTHS)
        ],
        warning_count=len(warnings),
    )


def _errors_report_no_climate_data(errors: list[object]) -> bool:
    return any(
        isinstance(error, str) and "no climate data" in error.casefold()
        for error in errors
    )


def _response_reports_no_climate_data(response_text: object) -> bool:
    if not isinstance(response_text, str):
        return False
    try:
        payload = json.loads(
            response_text,
            parse_constant=_reject_non_standard_json_constant,
        )
    except (json.JSONDecodeError, UnexpectedPVWattsResponse):
        return False
    if not isinstance(payload, dict):
        return False
    errors = payload.get("errors")
    return isinstance(errors, list) and _errors_report_no_climate_data(errors)


def _parse_months(value: object) -> list[float]:
    if not isinstance(value, list) or len(value) != len(MONTHS):
        raise UnexpectedPVWattsResponse
    return [_parse_number(item) for item in value]


def _parse_number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise UnexpectedPVWattsResponse
    try:
        number = float(value)
    except OverflowError as error:
        raise UnexpectedPVWattsResponse from error
    if not math.isfinite(number):
        raise UnexpectedPVWattsResponse
    return number


def _persist_pending(site: Site) -> None:
    site.pvwatts_status = ProcessingStatus.PENDING
    site.pvwatts_assumptions = None
    site.annual_ac_kwh = None
    site.capacity_factor_percent = None
    site.annual_solar_radiation_kwh_m2_day = None
    site.monthly_pvwatts_data = None
    site.pvwatts_error = None
    site.pvwatts_attempted_at = None
    site.save(
        update_fields=(
            "pvwatts_status",
            "pvwatts_assumptions",
            "annual_ac_kwh",
            "capacity_factor_percent",
            "annual_solar_radiation_kwh_m2_day",
            "monthly_pvwatts_data",
            "pvwatts_error",
            "pvwatts_attempted_at",
            "updated_at",
        )
    )


def _persist_success(
    site: Site,
    assumptions: dict[str, float | int | str],
    result: PVWattsResult,
) -> None:
    site.pvwatts_status = ProcessingStatus.SUCCEEDED
    site.pvwatts_assumptions = {
        **assumptions,
        "endpoint": "pvwatts",
        "version": "v8",
    }
    site.annual_ac_kwh = result.annual_ac_kwh
    site.capacity_factor_percent = result.capacity_factor_percent
    site.annual_solar_radiation_kwh_m2_day = result.annual_solar_radiation_kwh_m2_day
    site.monthly_pvwatts_data = result.monthly_pvwatts_data
    site.pvwatts_error = None
    site.pvwatts_attempted_at = timezone.now()
    site.save(
        update_fields=(
            "pvwatts_status",
            "pvwatts_assumptions",
            "annual_ac_kwh",
            "capacity_factor_percent",
            "annual_solar_radiation_kwh_m2_day",
            "monthly_pvwatts_data",
            "pvwatts_error",
            "pvwatts_attempted_at",
            "updated_at",
        )
    )


def _persist_failure(site: Site, error: str) -> None:
    site.pvwatts_status = ProcessingStatus.FAILED
    site.pvwatts_error = error
    site.pvwatts_attempted_at = timezone.now()
    site.save(
        update_fields=(
            "pvwatts_status",
            "pvwatts_error",
            "pvwatts_attempted_at",
            "updated_at",
        )
    )
