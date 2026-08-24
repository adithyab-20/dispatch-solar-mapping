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
from sites.services.pvwatts import (
    PVWATTS_BASE_ASSUMPTIONS,
    PVWATTS_SESSION,
    PVWATTS_TIMEOUT_SECONDS,
    check_pvwatts_connection,
    run_pvwatts,
)
from sites.services.solar_resource import SOLAR_RESOURCE_SESSION

AC_MONTHLY = [
    8_200.4,
    8_750.2,
    10_980.1,
    11_840.7,
    13_210.3,
    14_002.9,
    14_820.6,
    13_940.8,
    12_004.5,
    10_210.4,
    8_820.3,
    7_654.2,
]
SOLAR_RADIATION_MONTHLY = [
    3.1,
    3.6,
    4.5,
    5.2,
    5.9,
    6.3,
    6.6,
    6.1,
    5.4,
    4.3,
    3.4,
    2.9,
]
VALID_PVWATTS_PAYLOAD: dict[str, object] = {
    "version": "8.0.0",
    "warnings": [],
    "errors": [],
    "outputs": {
        "ac_monthly": AC_MONTHLY,
        "solrad_monthly": SOLAR_RADIATION_MONTHLY,
        "ac_annual": 134_435.4,
        "solrad_annual": 4.78,
        "capacity_factor": 15.35,
    },
}
EXPECTED_MONTHLY_PVWATTS_DATA = [
    {
        "month": month,
        "ac_kwh": AC_MONTHLY[index],
        "solar_radiation_kwh_m2_day": SOLAR_RADIATION_MONTHLY[index],
    }
    for index, month in enumerate(MONTHS)
]


@dataclass(frozen=True)
class FailureCase:
    expected_error: str
    response_status: int = 200
    response_text: str = ""
    request_error: requests.RequestException | None = None


def create_resolved_site() -> Site:
    return Site.objects.create(
        name="Boulder Solar",
        address="100 Solar Way",
        geocode_status=GeocodeStatus.RESOLVED,
        geocode_attempted_at=timezone.now(),
        latitude=40.0,
        longitude=-105.0,
    )


def payload_with_output(output_name: str, value: object) -> str:
    payload = deepcopy(VALID_PVWATTS_PAYLOAD)
    outputs = payload["outputs"]
    assert isinstance(outputs, dict)
    outputs[output_name] = value
    return json.dumps(payload)


def test_connection_check_uses_fixed_coordinates_and_the_production_validator(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-api-key"
    settings.NLR_API_BASE = "https://developer.example.test"
    pvwatts_get = Mock(
        return_value=Mock(
            status_code=200,
            text=json.dumps(deepcopy(VALID_PVWATTS_PAYLOAD)),
        )
    )
    monkeypatch.setattr(PVWATTS_SESSION, "get", pvwatts_get)

    result = check_pvwatts_connection()

    assert len(result.monthly_pvwatts_data) == 12
    pvwatts_get.assert_called_once_with(
        "https://developer.example.test/api/pvwatts/v8.json",
        params={
            **PVWATTS_BASE_ASSUMPTIONS,
            "tilt": 40.0,
            "lat": 40.0,
            "lon": -105.0,
            "api_key": "test-api-key",
        },
        timeout=PVWATTS_TIMEOUT_SECONDS,
    )


@pytest.mark.django_db(transaction=True)
def test_import_runs_pvwatts_after_solar_resource_failure_and_persists_result(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-api-key"
    settings.NLR_API_BASE = "https://developer.example.test"
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Chicago Solar", "address": "200 W Washington St"}])
    )
    monkeypatch.setattr(
        NOMINATIM_GATEWAY.session,
        "get",
        Mock(
            return_value=Mock(
                status_code=200,
                text=json.dumps(
                    [
                        {
                            "lat": "41.8837",
                            "lon": "-87.6325",
                            "display_name": (
                                "200 West Washington Street, Chicago, Illinois"
                            ),
                        }
                    ]
                ),
            )
        ),
    )
    monkeypatch.setattr(
        SOLAR_RESOURCE_SESSION,
        "get",
        Mock(return_value=Mock(status_code=503, text="provider unavailable")),
    )

    def assert_pending_then_respond(*args: object, **kwargs: object) -> Mock:
        assert connection.in_atomic_block is False
        pending_site = Site.objects.get()
        assert pending_site.solar_resource_status == ProcessingStatus.FAILED
        assert pending_site.pvwatts_status == ProcessingStatus.PENDING
        assert pending_site.pvwatts_attempted_at is None
        assert pending_site.pvwatts_assumptions is None
        assert pending_site.annual_ac_kwh is None
        assert pending_site.capacity_factor_percent is None
        assert pending_site.annual_solar_radiation_kwh_m2_day is None
        assert pending_site.monthly_pvwatts_data is None
        assert pending_site.pvwatts_error is None
        return Mock(
            status_code=200,
            text=json.dumps(deepcopy(VALID_PVWATTS_PAYLOAD)),
        )

    pvwatts_get = Mock(side_effect=assert_pending_then_respond)
    monkeypatch.setattr(PVWATTS_SESSION, "get", pvwatts_get)

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get()
    expected_assumptions = {
        **PVWATTS_BASE_ASSUMPTIONS,
        "tilt": 41.9,
        "lat": 41.8837,
        "lon": -87.6325,
        "endpoint": "pvwatts",
        "version": "v8",
    }
    assert site.solar_resource_status == ProcessingStatus.FAILED
    assert site.pvwatts_status == ProcessingStatus.SUCCEEDED
    assert site.pvwatts_assumptions == expected_assumptions
    assert "api_key" not in site.pvwatts_assumptions
    assert site.annual_ac_kwh == 134_435.4
    assert site.capacity_factor_percent == 15.35
    assert site.annual_solar_radiation_kwh_m2_day == 4.78
    assert site.monthly_pvwatts_data == EXPECTED_MONTHLY_PVWATTS_DATA
    assert site.pvwatts_error is None
    assert site.pvwatts_attempted_at is not None
    pvwatts_get.assert_called_once_with(
        "https://developer.example.test/api/pvwatts/v8.json",
        params={
            **PVWATTS_BASE_ASSUMPTIONS,
            "tilt": 41.9,
            "lat": 41.8837,
            "lon": -87.6325,
            "api_key": "test-api-key",
        },
        timeout=PVWATTS_TIMEOUT_SECONDS,
    )


@pytest.mark.django_db
def test_missing_api_key_fails_without_requesting(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = ""
    pvwatts_get = Mock()
    monkeypatch.setattr(PVWATTS_SESSION, "get", pvwatts_get)
    site = create_resolved_site()

    run_pvwatts(site)

    site.refresh_from_db()
    assert site.pvwatts_status == ProcessingStatus.FAILED
    assert site.pvwatts_error == "NLR_API_KEY not configured"
    assert site.pvwatts_attempted_at is not None
    pvwatts_get.assert_not_called()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "case",
    [
        pytest.param(
            FailureCase(
                expected_error="PVWatts timed out after 10s",
                request_error=requests.Timeout(
                    "GET https://developer.example.test?api_key=secret-api-key"
                ),
            ),
            id="timeout",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts service is unavailable",
                request_error=requests.ConnectionError("secret connection details"),
            ),
            id="connection",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts request failed",
                request_error=requests.RequestException("secret request headers"),
            ),
            id="request",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts service returned HTTP 503",
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
                expected_error="PVWatts found no climate data within 100 miles",
                response_status=422,
                response_text=json.dumps(
                    {
                        "errors": [
                            "No climate data found with dataset=nsrdb for the "
                            "location specified."
                        ]
                    }
                ),
            ),
            id="no-climate-data",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts returned an unexpected response",
                response_text="{not json containing secret-api-key",
            ),
            id="malformed-json",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts provider reported an error",
                response_text=json.dumps(
                    {"errors": ["secret provider query and api_key"]}
                ),
            ),
            id="body-error",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts returned an unexpected response",
                response_text=payload_with_output("ac_annual", "134435.4"),
            ),
            id="wrong-type",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts returned an unexpected response",
                response_text=payload_with_output("capacity_factor", True),
            ),
            id="boolean",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts returned an unexpected response",
                response_text=payload_with_output(
                    "solrad_monthly",
                    [*SOLAR_RADIATION_MONTHLY[:-1], float("nan")],
                ),
            ),
            id="non-finite",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts returned an unexpected response",
                response_text=payload_with_output("solrad_annual", 10**400),
            ),
            id="overflowing-number",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts returned an unexpected response",
                response_text=payload_with_output("ac_monthly", AC_MONTHLY[:-1]),
            ),
            id="incomplete-production-months",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts returned an unexpected response",
                response_text=payload_with_output(
                    "solrad_monthly", SOLAR_RADIATION_MONTHLY[:-1]
                ),
            ),
            id="incomplete-radiation-months",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts returned an unexpected response",
                response_text=json.dumps(
                    {**deepcopy(VALID_PVWATTS_PAYLOAD), "errors": "not an array"}
                ),
            ),
            id="invalid-errors",
        ),
        pytest.param(
            FailureCase(
                expected_error="PVWatts returned an unexpected response",
                response_text=json.dumps(
                    {**deepcopy(VALID_PVWATTS_PAYLOAD), "warnings": "not an array"}
                ),
            ),
            id="invalid-warnings",
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
    site.pvwatts_status = ProcessingStatus.SUCCEEDED
    site.pvwatts_assumptions = {"stale": True}
    site.annual_ac_kwh = 999.1
    site.capacity_factor_percent = 99.2
    site.annual_solar_radiation_kwh_m2_day = 99.3
    site.monthly_pvwatts_data = [{"month": "stale"}]
    site.pvwatts_attempted_at = timezone.now()
    site.save()
    if case.request_error is not None:
        pvwatts_get = Mock(side_effect=case.request_error)
    else:
        pvwatts_get = Mock(
            return_value=Mock(
                status_code=case.response_status,
                text=case.response_text,
            )
        )
    monkeypatch.setattr(PVWATTS_SESSION, "get", pvwatts_get)

    run_pvwatts(site)

    site.refresh_from_db()
    assert site.pvwatts_status == ProcessingStatus.FAILED
    assert site.pvwatts_error == case.expected_error
    assert site.pvwatts_attempted_at is not None
    assert site.pvwatts_assumptions is None
    assert site.annual_ac_kwh is None
    assert site.capacity_factor_percent is None
    assert site.annual_solar_radiation_kwh_m2_day is None
    assert site.monthly_pvwatts_data is None
    assert "secret" not in site.pvwatts_error.lower()
    assert "secret" not in caplog.text.lower()


@pytest.mark.django_db
def test_provider_warnings_are_logged_safely_without_failing_or_persisting(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings.NLR_API_KEY = "secret-api-key"
    payload = deepcopy(VALID_PVWATTS_PAYLOAD)
    payload["warnings"] = [
        "secret-api-key at https://developer.example.test?lat=40&lon=-105"
    ]
    monkeypatch.setattr(
        PVWATTS_SESSION,
        "get",
        Mock(return_value=Mock(status_code=200, text=json.dumps(payload))),
    )
    site = create_resolved_site()

    run_pvwatts(site)

    site.refresh_from_db()
    assert site.pvwatts_status == ProcessingStatus.SUCCEEDED
    assert site.pvwatts_error is None
    assert site.monthly_pvwatts_data == EXPECTED_MONTHLY_PVWATTS_DATA
    assert "PVWatts returned 1 warning(s)" in caplog.text
    assert "secret-api-key" not in caplog.text
    assert "https://" not in caplog.text


@pytest.mark.django_db(transaction=True)
def test_unexpected_error_leaves_pending_state_and_a_later_attempt_can_recover(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-api-key"
    site = create_resolved_site()
    pvwatts_get = Mock(side_effect=RuntimeError("unexpected programming failure"))
    monkeypatch.setattr(PVWATTS_SESSION, "get", pvwatts_get)

    with pytest.raises(RuntimeError, match="unexpected programming failure"):
        run_pvwatts(site)

    site.refresh_from_db()
    assert site.pvwatts_status == ProcessingStatus.PENDING
    assert site.pvwatts_attempted_at is None
    assert site.pvwatts_error is None
    assert site.pvwatts_assumptions is None
    assert site.monthly_pvwatts_data is None

    pvwatts_get.side_effect = None
    pvwatts_get.return_value = Mock(
        status_code=200,
        text=json.dumps(deepcopy(VALID_PVWATTS_PAYLOAD)),
    )
    run_pvwatts(site)

    site.refresh_from_db()
    assert site.pvwatts_status == ProcessingStatus.SUCCEEDED
    assert site.pvwatts_attempted_at is not None
    assert site.monthly_pvwatts_data == EXPECTED_MONTHLY_PVWATTS_DATA


@pytest.mark.django_db
def test_each_resolved_site_runs_its_own_pvwatts_estimate(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-api-key"
    sites = [
        Site.objects.create(
            name=name,
            address="100 Shared Solar Way",
            geocode_status=GeocodeStatus.RESOLVED,
            geocode_attempted_at=timezone.now(),
            latitude=40.0,
            longitude=-105.0,
        )
        for name in ("North Array", "South Array")
    ]
    pvwatts_get = Mock(
        return_value=Mock(
            status_code=200,
            text=json.dumps(deepcopy(VALID_PVWATTS_PAYLOAD)),
        )
    )
    monkeypatch.setattr(PVWATTS_SESSION, "get", pvwatts_get)

    for site in sites:
        run_pvwatts(site)

    assert pvwatts_get.call_count == 2
    assert list(
        Site.objects.order_by("id").values_list("pvwatts_status", flat=True)
    ) == [ProcessingStatus.SUCCEEDED, ProcessingStatus.SUCCEEDED]
