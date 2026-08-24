import json
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import Mock

import pytest
import requests
from django.core.management import call_command
from django.db import connection
from django.utils import timezone
from pytest_django.fixtures import Settings

from sites.models import GeocodeStatus, ProcessingStatus, Site
from sites.services.constants import MONTHS
from sites.services.geocoding import NOMINATIM_GATEWAY
from sites.services.solar_resource import (
    SOLAR_RESOURCE_SESSION,
    SOLAR_RESOURCE_TIMEOUT_SECONDS,
    fetch_solar_resource,
)

MONTHLY_DNI = {
    "jan": 5.0,
    "feb": 5.34,
    "mar": 5.94,
    "apr": 6.11,
    "may": 6.36,
    "jun": 7.43,
    "jul": 7.48,
    "aug": 6.65,
    "sep": 6.81,
    "oct": 5.82,
    "nov": 5.11,
    "dec": 4.67,
}
MONTHLY_GHI = {
    "jan": 2.5,
    "feb": 3.43,
    "mar": 4.69,
    "apr": 5.69,
    "may": 6.6,
    "jun": 7.25,
    "jul": 7.14,
    "aug": 6.24,
    "sep": 5.35,
    "oct": 3.85,
    "nov": 2.75,
    "dec": 2.19,
}
MONTHLY_LATITUDE_TILT = {
    "jan": 4.79,
    "feb": 5.4,
    "mar": 6.07,
    "apr": 6.11,
    "may": 6.25,
    "jun": 6.47,
    "jul": 6.58,
    "aug": 6.44,
    "sep": 6.53,
    "oct": 5.71,
    "nov": 4.99,
    "dec": 4.47,
}

VALID_SOLAR_RESOURCE_PAYLOAD: dict[str, object] = {
    "version": "1.0.0",
    "warnings": [],
    "errors": [],
    "outputs": {
        "avg_dni": {
            "annual": 6.06,
            "monthly": MONTHLY_DNI,
        },
        "avg_ghi": {
            "annual": 4.81,
            "monthly": MONTHLY_GHI,
        },
        "avg_lat_tilt": {
            "annual": 5.82,
            "monthly": MONTHLY_LATITUDE_TILT,
        },
    },
}

EXPECTED_MONTHLY_SOLAR_DATA = [
    {
        "month": month,
        "ghi_kwh_m2_day": MONTHLY_GHI[month],
        "dni_kwh_m2_day": MONTHLY_DNI[month],
        "latitude_tilt_kwh_m2_day": MONTHLY_LATITUDE_TILT[month],
    }
    for month in MONTHS
]


@dataclass(frozen=True)
class FailureCase:
    expected_error: str
    response_status: int = 200
    response_text: str = ""
    request_error: requests.RequestException | None = None


def mutable_metric_payload(
    metric_name: str,
) -> tuple[dict[str, object], dict[object, object]]:
    payload = deepcopy(VALID_SOLAR_RESOURCE_PAYLOAD)
    outputs = payload["outputs"]
    assert isinstance(outputs, dict)
    metric = outputs[metric_name]
    assert isinstance(metric, dict)
    return payload, metric


def payload_with_metric_value(
    metric_name: str,
    section: str,
    value: object,
    *,
    month: str | None = None,
) -> str:
    payload, metric = mutable_metric_payload(metric_name)
    if section == "annual":
        metric["annual"] = value
    else:
        monthly = metric["monthly"]
        assert isinstance(monthly, dict)
        assert month is not None
        monthly[month] = value
    return json.dumps(payload)


def payload_without_month(metric_name: str, month: str) -> str:
    payload, metric = mutable_metric_payload(metric_name)
    monthly = metric["monthly"]
    assert isinstance(monthly, dict)
    monthly.pop(month)
    return json.dumps(payload)


def payload_without_metric_field(metric_name: str, field: str) -> str:
    payload, metric = mutable_metric_payload(metric_name)
    metric.pop(field)
    return json.dumps(payload)


def create_resolved_site() -> Site:
    return Site.objects.create(
        name="Boulder Solar",
        address="100 Solar Way",
        geocode_status=GeocodeStatus.RESOLVED,
        geocode_attempted_at=timezone.now(),
        latitude=40.0,
        longitude=-105.0,
    )


def resolved_nominatim_response() -> Mock:
    return Mock(
        status_code=200,
        text=json.dumps(
            [
                {
                    "lat": "40.0",
                    "lon": "-105.0",
                    "display_name": "100 Solar Way, Boulder, Colorado",
                }
            ]
        ),
    )


@pytest.mark.django_db(transaction=True)
def test_import_fetches_and_persists_canonical_solar_resource_data_after_commit(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-api-key"
    settings.NLR_API_BASE = "https://developer.example.test"
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Boulder Solar", "address": "100 Solar Way"}])
    )
    monkeypatch.setattr(
        NOMINATIM_GATEWAY.session,
        "get",
        Mock(return_value=resolved_nominatim_response()),
    )

    def assert_pending_then_respond(*args: object, **kwargs: object) -> Mock:
        assert connection.in_atomic_block is False
        pending_site = Site.objects.get()
        assert pending_site.solar_resource_status == ProcessingStatus.PENDING
        assert pending_site.solar_resource_attempted_at is None
        assert pending_site.annual_ghi_kwh_m2_day is None
        assert pending_site.annual_dni_kwh_m2_day is None
        assert pending_site.annual_latitude_tilt_kwh_m2_day is None
        assert pending_site.monthly_solar_data is None
        assert pending_site.solar_resource_error is None
        return Mock(
            status_code=200,
            text=json.dumps(deepcopy(VALID_SOLAR_RESOURCE_PAYLOAD)),
        )

    solar_get = Mock(side_effect=assert_pending_then_respond)
    monkeypatch.setattr(SOLAR_RESOURCE_SESSION, "get", solar_get)

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get()
    assert site.solar_resource_status == ProcessingStatus.SUCCEEDED
    assert site.annual_ghi_kwh_m2_day == 4.81
    assert site.annual_dni_kwh_m2_day == 6.06
    assert site.annual_latitude_tilt_kwh_m2_day == 5.82
    assert site.monthly_solar_data == EXPECTED_MONTHLY_SOLAR_DATA
    assert site.solar_resource_error is None
    assert site.solar_resource_attempted_at is not None
    assert site.pvwatts_status == ProcessingStatus.BLOCKED
    solar_get.assert_called_once_with(
        "https://developer.example.test/api/solar/solar_resource/v1.json",
        params={"api_key": "test-api-key", "lat": 40.0, "lon": -105.0},
        timeout=SOLAR_RESOURCE_TIMEOUT_SECONDS,
    )


@pytest.mark.django_db
def test_each_resolved_site_fetches_its_own_solar_resource_result(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-api-key"
    shared_address = "100 Shared Solar Way"
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "North Array", "address": shared_address},
                {"name": "South Array", "address": shared_address},
            ]
        )
    )
    nominatim_get = Mock(return_value=resolved_nominatim_response())
    solar_get = Mock(
        return_value=Mock(
            status_code=200,
            text=json.dumps(deepcopy(VALID_SOLAR_RESOURCE_PAYLOAD)),
        )
    )
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", nominatim_get)
    monkeypatch.setattr(SOLAR_RESOURCE_SESSION, "get", solar_get)

    call_command("import_sites", import_path, mode="upsert")

    sites = list(Site.objects.order_by("id"))
    assert nominatim_get.call_count == 1
    assert solar_get.call_count == 2
    assert [site.solar_resource_status for site in sites] == [
        ProcessingStatus.SUCCEEDED,
        ProcessingStatus.SUCCEEDED,
    ]
    assert sites[0].solar_resource_attempted_at is not None
    assert sites[1].solar_resource_attempted_at is not None


@pytest.mark.django_db
def test_missing_api_key_fails_without_requesting(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = ""
    solar_get = Mock()
    monkeypatch.setattr(SOLAR_RESOURCE_SESSION, "get", solar_get)
    site = create_resolved_site()

    fetch_solar_resource(site)

    site.refresh_from_db()
    assert site.solar_resource_status == ProcessingStatus.FAILED
    assert site.solar_resource_error == "NLR_API_KEY not configured"
    assert site.solar_resource_attempted_at is not None
    solar_get.assert_not_called()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "case",
    [
        pytest.param(
            FailureCase(
                expected_error="Solar Resource timed out after 10s",
                request_error=requests.Timeout(
                    "GET https://developer.example.test?api_key=secret-api-key"
                ),
            ),
            id="timeout",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource service is unavailable",
                request_error=requests.ConnectionError("secret connection details"),
            ),
            id="connection",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource request failed",
                request_error=requests.RequestException("secret request headers"),
            ),
            id="request",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource service returned HTTP 503",
                response_status=503,
                response_text="secret provider body",
            ),
            id="http-status",
        ),
        pytest.param(
            FailureCase(
                expected_error="NLR rate limit exceeded - retry in about an hour",
                response_status=429,
                response_text="secret provider body",
            ),
            id="rate-limit",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource returned an unexpected response",
                response_text="{not json containing secret-api-key",
            ),
            id="malformed-json",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource provider reported an error",
                response_text=json.dumps(
                    {"errors": ["secret provider query and api_key"]}
                ),
            ),
            id="body-error",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource returned an unexpected response",
                response_text=payload_with_metric_value("avg_ghi", "annual", "4.81"),
            ),
            id="wrong-type",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource returned an unexpected response",
                response_text=payload_with_metric_value(
                    "avg_dni", "monthly", float("nan"), month="jun"
                ),
            ),
            id="non-finite",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource returned an unexpected response",
                response_text=payload_with_metric_value(
                    "avg_lat_tilt", "annual", 10**400
                ),
            ),
            id="overflowing-number",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource returned an unexpected response",
                response_text=payload_without_month("avg_ghi", "dec"),
            ),
            id="incomplete-months",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource returned an unexpected response",
                response_text=payload_without_metric_field("avg_dni", "annual"),
            ),
            id="missing-consumed-field",
        ),
        pytest.param(
            FailureCase(
                expected_error="Solar Resource returned an unexpected response",
                response_text=json.dumps(
                    {
                        **deepcopy(VALID_SOLAR_RESOURCE_PAYLOAD),
                        "warnings": [float("nan")],
                    }
                ),
            ),
            id="non-standard-json-constant",
        ),
    ],
)
def test_handled_failures_clear_stale_results_without_exposing_provider_details(
    case: FailureCase,
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings.NLR_API_KEY = "secret-api-key"
    site = create_resolved_site()
    site.solar_resource_status = ProcessingStatus.SUCCEEDED
    site.annual_ghi_kwh_m2_day = 9.1
    site.annual_dni_kwh_m2_day = 9.2
    site.annual_latitude_tilt_kwh_m2_day = 9.3
    site.monthly_solar_data = [{"month": "stale"}]
    site.solar_resource_attempted_at = timezone.now()
    site.save()
    if case.request_error is not None:
        solar_get = Mock(side_effect=case.request_error)
    else:
        solar_get = Mock(
            return_value=Mock(
                status_code=case.response_status,
                text=case.response_text,
            )
        )
    monkeypatch.setattr(SOLAR_RESOURCE_SESSION, "get", solar_get)

    fetch_solar_resource(site)

    site.refresh_from_db()
    assert site.solar_resource_status == ProcessingStatus.FAILED
    assert site.solar_resource_error == case.expected_error
    assert site.solar_resource_attempted_at is not None
    assert site.annual_ghi_kwh_m2_day is None
    assert site.annual_dni_kwh_m2_day is None
    assert site.annual_latitude_tilt_kwh_m2_day is None
    assert site.monthly_solar_data is None
    assert "secret" not in site.solar_resource_error.lower()
    assert "secret" not in caplog.text.lower()


def test_source_does_not_reference_the_retired_nlr_hostname() -> None:
    project_root = Path(__file__).resolve().parents[3]
    source_paths = [
        *sorted((project_root / "backend" / "config").rglob("*.py")),
        *sorted((project_root / "backend" / "sites").rglob("*.py")),
        project_root / "backend" / "manage.py",
        project_root / "backend" / "pyproject.toml",
        project_root / ".env.example",
        project_root / "README.md",
    ]
    retired_hostname = "developer." + "nrel.gov"

    assert all(
        retired_hostname not in path.read_text(encoding="utf-8")
        for path in source_paths
    )


@pytest.mark.django_db
def test_provider_warnings_are_logged_safely_without_failing_or_persisting(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings.NLR_API_KEY = "secret-api-key"
    payload = deepcopy(VALID_SOLAR_RESOURCE_PAYLOAD)
    payload["warnings"] = [
        "secret-api-key at https://developer.example.test?lat=40&lon=-105"
    ]
    monkeypatch.setattr(
        SOLAR_RESOURCE_SESSION,
        "get",
        Mock(return_value=Mock(status_code=200, text=json.dumps(payload))),
    )
    site = create_resolved_site()

    fetch_solar_resource(site)

    site.refresh_from_db()
    assert site.solar_resource_status == ProcessingStatus.SUCCEEDED
    assert site.solar_resource_error is None
    assert site.monthly_solar_data == EXPECTED_MONTHLY_SOLAR_DATA
    assert "Solar Resource returned 1 warning(s)" in caplog.text
    assert "secret-api-key" not in caplog.text
    assert "https://" not in caplog.text


@pytest.mark.django_db(transaction=True)
def test_unexpected_error_leaves_pending_state_and_a_later_attempt_can_recover(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-api-key"
    site = create_resolved_site()
    solar_get = Mock(side_effect=RuntimeError("unexpected programming failure"))
    monkeypatch.setattr(SOLAR_RESOURCE_SESSION, "get", solar_get)

    with pytest.raises(RuntimeError, match="unexpected programming failure"):
        fetch_solar_resource(site)

    site.refresh_from_db()
    assert site.solar_resource_status == ProcessingStatus.PENDING
    assert site.solar_resource_attempted_at is None
    assert site.solar_resource_error is None
    assert site.monthly_solar_data is None

    solar_get.side_effect = None
    solar_get.return_value = Mock(
        status_code=200,
        text=json.dumps(deepcopy(VALID_SOLAR_RESOURCE_PAYLOAD)),
    )
    fetch_solar_resource(site)

    site.refresh_from_db()
    assert site.solar_resource_status == ProcessingStatus.SUCCEEDED
    assert site.solar_resource_attempted_at is not None
    assert site.monthly_solar_data == EXPECTED_MONTHLY_SOLAR_DATA
