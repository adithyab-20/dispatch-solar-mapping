import json
import logging
import math
from dataclasses import dataclass

import requests
from django.conf import settings
from django.utils import timezone

from sites.models import GeocodeStatus, ProcessingStatus, Site
from sites.services.constants import MONTHS

logger = logging.getLogger(__name__)

SOLAR_RESOURCE_ENDPOINT_PATH = "/api/solar/solar_resource/v1.json"
SOLAR_RESOURCE_TIMEOUT_SECONDS = 10
SOLAR_RESOURCE_SESSION = requests.Session()


@dataclass(frozen=True)
class SolarResourceResult:
    annual_ghi_kwh_m2_day: float
    annual_dni_kwh_m2_day: float
    annual_latitude_tilt_kwh_m2_day: float
    monthly_solar_data: list[dict[str, str | float]]
    warning_count: int


class UnexpectedSolarResourceResponse(ValueError):
    pass


class SolarResourceProviderError(ValueError):
    def __init__(self, error_count: int) -> None:
        self.error_count = error_count
        super().__init__("Solar Resource provider reported an error")


def fetch_solar_resource(site: Site) -> None:
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

    endpoint = f"{settings.NLR_API_BASE.rstrip('/')}{SOLAR_RESOURCE_ENDPOINT_PATH}"
    params: dict[str, str | float] = {
        "api_key": api_key,
        "lat": latitude,
        "lon": longitude,
    }
    try:
        response = SOLAR_RESOURCE_SESSION.get(
            endpoint,
            params=params,
            timeout=SOLAR_RESOURCE_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        _persist_failure(
            site,
            f"Solar Resource timed out after {SOLAR_RESOURCE_TIMEOUT_SECONDS}s",
        )
        return
    except requests.ConnectionError:
        _persist_failure(site, "Solar Resource service is unavailable")
        return
    except requests.RequestException:
        _persist_failure(site, "Solar Resource request failed")
        return

    if response.status_code == 429:
        _persist_failure(site, "NLR rate limit exceeded - retry in about an hour")
        return
    if not 200 <= response.status_code < 300:
        _persist_failure(
            site,
            f"Solar Resource service returned HTTP {response.status_code}",
        )
        return

    try:
        result = parse_solar_resource_response(response.text)
    except SolarResourceProviderError as error:
        logger.warning(
            "Solar Resource provider reported %d error(s) for site %s.",
            error.error_count,
            site.pk,
        )
        _persist_failure(site, "Solar Resource provider reported an error")
        return
    except UnexpectedSolarResourceResponse:
        logger.warning(
            "Solar Resource returned an unexpected response for site %s.",
            site.pk,
        )
        _persist_failure(site, "Solar Resource returned an unexpected response")
        return

    if result.warning_count:
        logger.warning(
            "Solar Resource returned %d warning(s) for site %s.",
            result.warning_count,
            site.pk,
        )
    _persist_success(site, result)


def parse_solar_resource_response(response_text: str) -> SolarResourceResult:
    if not isinstance(response_text, str):
        raise UnexpectedSolarResourceResponse
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError as error:
        raise UnexpectedSolarResourceResponse from error
    if not isinstance(payload, dict):
        raise UnexpectedSolarResourceResponse

    errors = payload.get("errors", [])
    if not isinstance(errors, list):
        raise UnexpectedSolarResourceResponse
    if errors:
        raise SolarResourceProviderError(len(errors))

    warnings = payload.get("warnings", [])
    if not isinstance(warnings, list):
        raise UnexpectedSolarResourceResponse

    outputs = payload.get("outputs")
    if not isinstance(outputs, dict):
        raise UnexpectedSolarResourceResponse

    annual_ghi, monthly_ghi = _parse_metric(outputs, "avg_ghi")
    annual_dni, monthly_dni = _parse_metric(outputs, "avg_dni")
    annual_latitude_tilt, monthly_latitude_tilt = _parse_metric(outputs, "avg_lat_tilt")

    return SolarResourceResult(
        annual_ghi_kwh_m2_day=annual_ghi,
        annual_dni_kwh_m2_day=annual_dni,
        annual_latitude_tilt_kwh_m2_day=annual_latitude_tilt,
        monthly_solar_data=[
            {
                "month": month,
                "ghi_kwh_m2_day": monthly_ghi[month],
                "dni_kwh_m2_day": monthly_dni[month],
                "latitude_tilt_kwh_m2_day": monthly_latitude_tilt[month],
            }
            for month in MONTHS
        ],
        warning_count=len(warnings),
    )


def _parse_metric(
    outputs: dict[object, object], metric_name: str
) -> tuple[float, dict[str, float]]:
    metric = outputs.get(metric_name)
    if not isinstance(metric, dict):
        raise UnexpectedSolarResourceResponse

    annual = _parse_number(metric.get("annual"))
    monthly = metric.get("monthly")
    if not isinstance(monthly, dict):
        raise UnexpectedSolarResourceResponse
    if len(monthly) != len(MONTHS) or set(monthly) != set(MONTHS):
        raise UnexpectedSolarResourceResponse

    return annual, {month: _parse_number(monthly[month]) for month in MONTHS}


def _parse_number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise UnexpectedSolarResourceResponse
    try:
        number = float(value)
    except OverflowError as error:
        raise UnexpectedSolarResourceResponse from error
    if not math.isfinite(number):
        raise UnexpectedSolarResourceResponse
    return number


def _persist_pending(site: Site) -> None:
    site.solar_resource_status = ProcessingStatus.PENDING
    site.annual_ghi_kwh_m2_day = None
    site.annual_dni_kwh_m2_day = None
    site.annual_latitude_tilt_kwh_m2_day = None
    site.monthly_solar_data = None
    site.solar_resource_error = None
    site.solar_resource_attempted_at = None
    site.save(
        update_fields=(
            "solar_resource_status",
            "annual_ghi_kwh_m2_day",
            "annual_dni_kwh_m2_day",
            "annual_latitude_tilt_kwh_m2_day",
            "monthly_solar_data",
            "solar_resource_error",
            "solar_resource_attempted_at",
            "updated_at",
        )
    )


def _persist_success(site: Site, result: SolarResourceResult) -> None:
    site.solar_resource_status = ProcessingStatus.SUCCEEDED
    site.annual_ghi_kwh_m2_day = result.annual_ghi_kwh_m2_day
    site.annual_dni_kwh_m2_day = result.annual_dni_kwh_m2_day
    site.annual_latitude_tilt_kwh_m2_day = result.annual_latitude_tilt_kwh_m2_day
    site.monthly_solar_data = result.monthly_solar_data
    site.solar_resource_error = None
    site.solar_resource_attempted_at = timezone.now()
    site.save(
        update_fields=(
            "solar_resource_status",
            "annual_ghi_kwh_m2_day",
            "annual_dni_kwh_m2_day",
            "annual_latitude_tilt_kwh_m2_day",
            "monthly_solar_data",
            "solar_resource_error",
            "solar_resource_attempted_at",
            "updated_at",
        )
    )


def _persist_failure(site: Site, error: str) -> None:
    site.solar_resource_status = ProcessingStatus.FAILED
    site.solar_resource_error = error
    site.solar_resource_attempted_at = timezone.now()
    site.save(
        update_fields=(
            "solar_resource_status",
            "solar_resource_error",
            "solar_resource_attempted_at",
            "updated_at",
        )
    )
