import json
import logging
import math
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

import requests
from django.conf import settings
from django.utils import timezone

from sites.models import GeocodeStatus, Site

logger = logging.getLogger(__name__)

NOMINATIM_SEARCH_PATH = "/search"
NOMINATIM_STATUS_PATH = "/status"
NOMINATIM_TIMEOUT_SECONDS = 10
NOMINATIM_MINIMUM_INTERVAL_SECONDS = 1.1


@dataclass(frozen=True)
class GeocodingOutcome:
    status: GeocodeStatus
    attempted_at: datetime
    latitude: float | None = None
    longitude: float | None = None
    resolved_address: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class NominatimStatus:
    status: int
    message: str


class UnexpectedGeocodingResponse(ValueError):
    pass


class GeocodingConfigurationError(ValueError):
    pass


class NominatimStatusCheckError(RuntimeError):
    pass


class NominatimGateway:
    def __init__(
        self,
        session: requests.Session,
        *,
        monotonic: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.session = session
        self._monotonic = monotonic
        self._sleep = sleep
        self._request_lock = threading.Lock()
        self._last_request_started_at: float | None = None

    def search(self, address: str) -> requests.Response:
        params: dict[str, str | int] = {
            "q": address,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "us",
        }
        return self._get(self._url(NOMINATIM_SEARCH_PATH), params=params)

    def status(self) -> requests.Response:
        return self._get(self._url(NOMINATIM_STATUS_PATH), params={"format": "json"})

    @staticmethod
    def _url(path: str) -> str:
        base_url = settings.NOMINATIM_BASE_URL
        if not isinstance(base_url, str) or not base_url.strip():
            raise GeocodingConfigurationError
        return f"{base_url.rstrip('/')}{path}"

    def _get(
        self,
        url: str,
        *,
        params: dict[str, str | int],
    ) -> requests.Response:
        contact_email = settings.CONTACT_EMAIL
        if not isinstance(contact_email, str):
            raise GeocodingConfigurationError
        user_agent = "dispatch-solar-assessment/1.0 (interview take-home)"
        if contact_email:
            user_agent = (
                f"dispatch-solar-assessment/1.0 (interview take-home; {contact_email})"
            )
        else:
            logger.warning(
                "CONTACT_EMAIL is not configured; Nominatim requests will use "
                "the application-only User-Agent."
            )
        with self._request_lock:
            now = self._monotonic()
            if self._last_request_started_at is not None:
                delay = NOMINATIM_MINIMUM_INTERVAL_SECONDS - (
                    now - self._last_request_started_at
                )
                if delay > 0:
                    self._sleep(delay)
                    now = self._monotonic()
            self._last_request_started_at = now
            return self.session.get(
                url,
                params=params,
                headers={"User-Agent": user_agent},
                timeout=NOMINATIM_TIMEOUT_SECONDS,
            )


NOMINATIM_GATEWAY = NominatimGateway(requests.Session())


def check_nominatim_status() -> NominatimStatus:
    try:
        response = NOMINATIM_GATEWAY.status()
    except GeocodingConfigurationError:
        raise NominatimStatusCheckError("Nominatim configuration is invalid") from None
    except requests.Timeout:
        raise NominatimStatusCheckError(
            f"Nominatim status timed out after {NOMINATIM_TIMEOUT_SECONDS}s"
        ) from None
    except requests.ConnectionError:
        raise NominatimStatusCheckError("Nominatim status is unavailable") from None
    except requests.RequestException:
        raise NominatimStatusCheckError("Nominatim status request failed") from None

    if response.status_code != 200:
        raise NominatimStatusCheckError(
            f"Nominatim status returned HTTP {response.status_code}"
        )
    try:
        status = _parse_status(response.text)
    except UnexpectedGeocodingResponse:
        raise NominatimStatusCheckError(
            "Nominatim status returned an unexpected response"
        ) from None
    if status.status != 0:
        raise NominatimStatusCheckError("Nominatim reported an unhealthy status")
    return status


def _parse_status(response_text: str) -> NominatimStatus:
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError as error:
        raise UnexpectedGeocodingResponse from error
    if not isinstance(payload, dict):
        raise UnexpectedGeocodingResponse

    status = payload.get("status")
    message = payload.get("message")
    if isinstance(status, bool) or not isinstance(status, int):
        raise UnexpectedGeocodingResponse
    if not isinstance(message, str) or not message.strip():
        raise UnexpectedGeocodingResponse
    return NominatimStatus(status=status, message=message)


def geocode_site(
    site: Site, *, cached_outcome: GeocodingOutcome | None = None
) -> GeocodingOutcome:
    if cached_outcome is not None:
        _persist_outcome(site, cached_outcome)
        return cached_outcome

    try:
        response = NOMINATIM_GATEWAY.search(site.address)
    except GeocodingConfigurationError:
        return _persist_failure(site, "Geocoding configuration is invalid")
    except requests.Timeout:
        return _persist_failure(site, "Geocoding timed out after 10s")
    except requests.ConnectionError:
        return _persist_failure(site, "Geocoding service is unavailable")
    except requests.RequestException:
        return _persist_failure(site, "Geocoding request failed")
    if not 200 <= response.status_code < 300:
        return _persist_failure(
            site,
            f"Geocoding service returned HTTP {response.status_code}",
        )
    try:
        location = _parse_location(response.text)
    except UnexpectedGeocodingResponse:
        return _persist_failure(site, "Geocoding returned an unexpected response")
    if location is None:
        outcome = GeocodingOutcome(
            status=GeocodeStatus.UNRESOLVED,
            attempted_at=timezone.now(),
            error="No matching U.S. location was found for this address.",
        )
        _persist_outcome(site, outcome)
        return outcome

    latitude, longitude, resolved_address = location
    outcome = GeocodingOutcome(
        status=GeocodeStatus.RESOLVED,
        attempted_at=timezone.now(),
        latitude=latitude,
        longitude=longitude,
        resolved_address=resolved_address,
    )
    _persist_outcome(site, outcome)
    return outcome


def _parse_location(response_text: str) -> tuple[float, float, str] | None:
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError as error:
        raise UnexpectedGeocodingResponse from error

    if not isinstance(payload, list):
        raise UnexpectedGeocodingResponse
    if not payload:
        return None

    result = payload[0]
    if not isinstance(result, dict):
        raise UnexpectedGeocodingResponse

    latitude = _parse_coordinate(result.get("lat"), minimum=-90, maximum=90)
    longitude = _parse_coordinate(result.get("lon"), minimum=-180, maximum=180)
    resolved_address = result.get("display_name")
    if not isinstance(resolved_address, str) or not resolved_address.strip():
        raise UnexpectedGeocodingResponse
    return latitude, longitude, resolved_address


def _parse_coordinate(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise UnexpectedGeocodingResponse
    try:
        coordinate = float(value)
    except (OverflowError, ValueError) as error:
        raise UnexpectedGeocodingResponse from error
    if not math.isfinite(coordinate) or not minimum <= coordinate <= maximum:
        raise UnexpectedGeocodingResponse
    return coordinate


def _persist_outcome(site: Site, outcome: GeocodingOutcome) -> None:
    site.geocode_status = outcome.status
    site.geocode_attempted_at = outcome.attempted_at
    site.latitude = outcome.latitude
    site.longitude = outcome.longitude
    site.resolved_address = outcome.resolved_address
    site.geocode_error = outcome.error
    site.save(
        update_fields=(
            "geocode_status",
            "geocode_attempted_at",
            "latitude",
            "longitude",
            "resolved_address",
            "geocode_error",
            "updated_at",
        )
    )


def _persist_failure(site: Site, error: str) -> GeocodingOutcome:
    outcome = GeocodingOutcome(
        status=GeocodeStatus.FAILED,
        attempted_at=timezone.now(),
        error=error,
    )
    _persist_outcome(site, outcome)
    return outcome
