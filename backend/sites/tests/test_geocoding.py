import json
import threading
from pathlib import Path
from unittest.mock import Mock

import pytest
import requests
from django.core.management import call_command
from django.db import connection
from pytest_django.fixtures import Settings

from sites.models import GeocodeStatus, ProcessingStatus, Site
from sites.services import geocoding
from sites.services.geocoding import NOMINATIM_GATEWAY, NominatimGateway, geocode_site

pytestmark = pytest.mark.usefixtures("isolated_nominatim_gateway")


def test_nominatim_status_check_uses_the_policy_controlled_gateway(
    settings: Settings,
    isolated_nominatim_gateway: NominatimGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings.CONTACT_EMAIL = "solar@example.com"
    settings.NOMINATIM_BASE_URL = "https://nominatim.example.test/"
    http_get = Mock(
        return_value=Mock(
            status_code=200,
            text=json.dumps({"status": 0, "message": "OK"}),
        )
    )
    monkeypatch.setattr(isolated_nominatim_gateway.session, "get", http_get)

    result = geocoding.check_nominatim_status()

    assert result.status == 0
    assert result.message == "OK"
    http_get.assert_called_once_with(
        "https://nominatim.example.test/status",
        params={"format": "json"},
        headers={
            "User-Agent": (
                "dispatch-solar-assessment/1.0 (interview take-home; solar@example.com)"
            )
        },
        timeout=10,
    )


@pytest.mark.parametrize(
    ("response", "expected_error"),
    [
        pytest.param(
            Mock(status_code=503, text="provider body"),
            "Nominatim status returned HTTP 503",
            id="non-success-http",
        ),
        pytest.param(
            Mock(
                status_code=200,
                text=json.dumps({"status": 1, "message": "Database unavailable"}),
            ),
            "Nominatim reported an unhealthy status: Database unavailable",
            id="unhealthy-body-status",
        ),
        pytest.param(
            Mock(status_code=200, text="{not json"),
            "Nominatim status returned an unexpected response",
            id="malformed-json",
        ),
    ],
)
def test_nominatim_status_check_rejects_unhealthy_or_invalid_responses(
    response: Mock,
    expected_error: str,
    isolated_nominatim_gateway: NominatimGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        isolated_nominatim_gateway.session,
        "get",
        Mock(return_value=response),
    )

    with pytest.raises(geocoding.NominatimStatusCheckError, match=expected_error):
        geocoding.check_nominatim_status()


@pytest.mark.django_db(transaction=True)
def test_import_resolves_a_new_site_after_reconciliation_commits(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.CONTACT_EMAIL = "solar@example.com"
    reactivated = Site.objects.create(
        name="Stored Array",
        address="1 Existing Way",
        is_active=False,
    )
    import_path = tmp_path / "sites.json"
    address = "  121 N. LaSalle St., Chicago, IL 60602  "
    import_path.write_text(
        json.dumps(
            [
                {"name": "Chicago Sample", "address": address},
                {"name": "Stored Array", "address": "1 Existing Way"},
            ]
        )
    )
    response = Mock(
        status_code=200,
        text=json.dumps(
            [
                {
                    "lat": "41.8841",
                    "lon": "-87.6324",
                    "display_name": "121 North LaSalle Street, Chicago, Illinois",
                }
            ]
        ),
    )

    def get(*args: object, **kwargs: object) -> Mock:
        assert connection.in_atomic_block is False
        assert Site.objects.count() == 2
        assert Site.objects.get(pk=reactivated.pk).is_active is True
        assert Site.objects.get(name="Chicago Sample").address == address
        return response

    http_get = Mock(side_effect=get)
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get(name="Chicago Sample")
    assert site.geocode_status == GeocodeStatus.RESOLVED
    assert site.latitude == 41.8841
    assert site.longitude == -87.6324
    assert site.resolved_address == "121 North LaSalle Street, Chicago, Illinois"
    assert site.geocode_error is None
    assert site.geocode_attempted_at is not None
    assert site.solar_resource_status == ProcessingStatus.FAILED
    assert site.solar_resource_error == "NLR_API_KEY not configured"
    assert site.solar_resource_attempted_at is not None
    assert site.pvwatts_status == ProcessingStatus.BLOCKED
    http_get.assert_called_once_with(
        "https://nominatim.openstreetmap.org/search",
        params={
            "q": address,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "us",
        },
        headers={
            "User-Agent": (
                "dispatch-solar-assessment/1.0 (interview take-home; solar@example.com)"
            )
        },
        timeout=10,
    )


@pytest.mark.django_db
def test_import_persists_an_empty_search_as_unresolved(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Unknown Solar", "address": "Not a real U.S. address"}])
    )
    http_get = Mock(return_value=Mock(status_code=200, text="[]"))
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get()
    assert site.geocode_status == GeocodeStatus.UNRESOLVED
    assert site.latitude is None
    assert site.longitude is None
    assert site.resolved_address is None
    assert site.geocode_error == (
        "No matching U.S. location was found for this address."
    )
    assert site.geocode_attempted_at is not None
    assert site.solar_resource_status == ProcessingStatus.BLOCKED
    assert site.pvwatts_status == ProcessingStatus.BLOCKED


@pytest.mark.django_db
def test_import_persists_a_timeout_as_a_safe_geocoding_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Timed Out Solar", "address": "1 Secret Query Way"}])
    )
    http_get = Mock(
        side_effect=requests.Timeout(
            "GET https://nominatim.openstreetmap.org/search?q=1+Secret+Query+Way"
        )
    )
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get()
    assert site.geocode_status == GeocodeStatus.FAILED
    assert site.geocode_error == "Geocoding timed out after 10s"
    assert "Secret" not in site.geocode_error
    assert "https" not in site.geocode_error
    assert site.geocode_attempted_at is not None
    assert site.latitude is None
    assert site.longitude is None
    assert site.solar_resource_status == ProcessingStatus.BLOCKED
    assert site.pvwatts_status == ProcessingStatus.BLOCKED


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("request_error", "expected_safe_error"),
    [
        (
            requests.ConnectionError("connection refused for secret-address"),
            "Geocoding service is unavailable",
        ),
        (
            requests.RequestException("unsafe headers and query details"),
            "Geocoding request failed",
        ),
    ],
)
def test_import_persists_network_failures_without_raw_exception_details(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    request_error: requests.RequestException,
    expected_safe_error: str,
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Failed Solar", "address": "1 Secret Address"}])
    )
    monkeypatch.setattr(
        NOMINATIM_GATEWAY.session,
        "get",
        Mock(side_effect=request_error),
    )

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get()
    assert site.geocode_status == GeocodeStatus.FAILED
    assert site.geocode_error == expected_safe_error
    assert "secret" not in site.geocode_error.lower()
    assert site.geocode_attempted_at is not None
    assert site.latitude is None
    assert site.longitude is None


@pytest.mark.django_db
def test_import_persists_non_success_http_status_without_provider_body(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Unavailable Solar", "address": "2 Secret Lane"}])
    )
    monkeypatch.setattr(
        NOMINATIM_GATEWAY.session,
        "get",
        Mock(
            return_value=Mock(
                status_code=503,
                text="provider body with request URL and private details",
            )
        ),
    )

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get()
    assert site.geocode_status == GeocodeStatus.FAILED
    assert site.geocode_error == "Geocoding service returned HTTP 503"
    assert "provider body" not in site.geocode_error
    assert site.geocode_attempted_at is not None
    assert site.latitude is None
    assert site.longitude is None


@pytest.mark.django_db
def test_import_persists_invalid_gateway_configuration_without_requesting(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.CONTACT_EMAIL = 42
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Configured Solar", "address": "4 Config Way"}])
    )
    http_get = Mock()
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get()
    assert site.geocode_status == GeocodeStatus.FAILED
    assert site.geocode_error == "Geocoding configuration is invalid"
    assert site.geocode_attempted_at is not None
    assert site.latitude is None
    assert site.longitude is None
    http_get.assert_not_called()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "response_text",
    [
        pytest.param("{not json", id="malformed-json"),
        pytest.param(json.dumps({"lat": "41.0"}), id="non-list-payload"),
        pytest.param(json.dumps(["not an object"]), id="non-object-result"),
        pytest.param(
            json.dumps([{"lon": "-87.0", "display_name": "Chicago"}]),
            id="missing-coordinate",
        ),
        pytest.param(
            json.dumps([{"lat": True, "lon": "-87.0", "display_name": "Chicago"}]),
            id="boolean-coordinate",
        ),
        pytest.param(
            json.dumps([{"lat": "nan", "lon": "-87.0", "display_name": "Chicago"}]),
            id="non-finite-coordinate",
        ),
        pytest.param(
            json.dumps([{"lat": 10**400, "lon": "-87.0", "display_name": "Chicago"}]),
            id="overflowing-coordinate",
        ),
        pytest.param(
            json.dumps([{"lat": "90.1", "lon": "-87.0", "display_name": "Chicago"}]),
            id="out-of-range-coordinate",
        ),
        pytest.param(
            json.dumps([{"lat": "41.0", "lon": "-87.0", "display_name": "  "}]),
            id="empty-display-name",
        ),
    ],
)
def test_import_persists_malformed_consumed_fields_as_a_safe_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    response_text: str,
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Bad Response Solar", "address": "3 Response Way"}])
    )
    monkeypatch.setattr(
        NOMINATIM_GATEWAY.session,
        "get",
        Mock(return_value=Mock(status_code=200, text=response_text)),
    )

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get()
    assert site.geocode_status == GeocodeStatus.FAILED
    assert site.geocode_error == "Geocoding returned an unexpected response"
    assert site.geocode_attempted_at is not None
    assert site.latitude is None
    assert site.longitude is None
    assert site.resolved_address is None
    assert site.solar_resource_status == ProcessingStatus.BLOCKED
    assert site.pvwatts_status == ProcessingStatus.BLOCKED


@pytest.mark.django_db
def test_import_reuses_a_resolved_outcome_for_a_byte_identical_address(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = "100 Shared Roof Rd, Denver, CO"
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "North Array", "address": address},
                {"name": "South Array", "address": address},
            ]
        )
    )
    http_get = Mock(
        return_value=Mock(
            status_code=200,
            text=json.dumps(
                [
                    {
                        "lat": "39.7392",
                        "lon": "-104.9903",
                        "display_name": "100 Shared Roof Road, Denver, Colorado",
                    }
                ]
            ),
        )
    )
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)

    call_command("import_sites", import_path, mode="upsert")

    sites = list(Site.objects.order_by("id"))
    assert http_get.call_count == 1
    assert [site.geocode_status for site in sites] == [
        GeocodeStatus.RESOLVED,
        GeocodeStatus.RESOLVED,
    ]
    assert [site.latitude for site in sites] == [39.7392, 39.7392]
    assert [site.longitude for site in sites] == [-104.9903, -104.9903]
    assert sites[0].geocode_attempted_at == sites[1].geocode_attempted_at


@pytest.mark.django_db
def test_import_reuses_an_unresolved_outcome_for_a_byte_identical_address(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = "No Such Shared Address"
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "Unknown North", "address": address},
                {"name": "Unknown South", "address": address},
            ]
        )
    )
    http_get = Mock(return_value=Mock(status_code=200, text="[]"))
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)

    call_command("import_sites", import_path, mode="upsert")

    sites = list(Site.objects.order_by("id"))
    assert http_get.call_count == 1
    assert [site.geocode_status for site in sites] == [
        GeocodeStatus.UNRESOLVED,
        GeocodeStatus.UNRESOLVED,
    ]
    assert sites[0].geocode_error == sites[1].geocode_error
    assert sites[0].geocode_attempted_at == sites[1].geocode_attempted_at


@pytest.mark.django_db
def test_import_reuses_a_handled_failure_for_a_byte_identical_address(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = "10 Shared Failure Ave"
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "Failed North", "address": address},
                {"name": "Failed South", "address": address},
            ]
        )
    )
    http_get = Mock(side_effect=requests.ConnectionError("unsafe details"))
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)

    call_command("import_sites", import_path, mode="upsert")

    sites = list(Site.objects.order_by("id"))
    assert http_get.call_count == 1
    assert [site.geocode_status for site in sites] == [
        GeocodeStatus.FAILED,
        GeocodeStatus.FAILED,
    ]
    assert [site.geocode_error for site in sites] == [
        "Geocoding service is unavailable",
        "Geocoding service is unavailable",
    ]
    assert sites[0].geocode_attempted_at == sites[1].geocode_attempted_at


@pytest.mark.django_db
def test_import_queries_verbatim_formatting_variants_separately(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    addresses = ["12-14 Main St.", "12 14 Main St"]
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "Hyphenated Array", "address": addresses[0]},
                {"name": "Spaced Array", "address": addresses[1]},
            ]
        )
    )
    http_get = Mock(
        side_effect=[
            Mock(status_code=200, text="[]"),
            Mock(status_code=200, text="[]"),
        ]
    )
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)

    call_command("import_sites", import_path, mode="upsert")

    assert http_get.call_count == 2
    assert [call.kwargs["params"]["q"] for call in http_get.call_args_list] == addresses


@pytest.mark.django_db
def test_geocoding_result_cache_does_not_survive_the_import_command(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = "100 Reused Later Rd"
    import_path = tmp_path / "sites.json"
    http_get = Mock(return_value=Mock(status_code=200, text="[]"))
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)
    import_path.write_text(json.dumps([{"name": "First Array", "address": address}]))
    call_command("import_sites", import_path, mode="upsert")
    import_path.write_text(json.dumps([{"name": "Second Array", "address": address}]))

    call_command("import_sites", import_path, mode="upsert")

    assert http_get.call_count == 2


@pytest.mark.django_db
def test_repeating_an_unchanged_import_makes_no_new_geocoding_request(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Stable Array", "address": "100 Stable Way"}])
    )
    http_get = Mock(return_value=Mock(status_code=200, text="[]"))
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)
    call_command("import_sites", import_path, mode="upsert")
    before = Site.objects.values().get()

    call_command("import_sites", import_path, mode="upsert")

    assert http_get.call_count == 1
    assert Site.objects.values().get() == before


@pytest.mark.django_db(transaction=True)
def test_unexpected_error_propagates_and_leaves_unfinished_sites_pending(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "First Array", "address": "1 First Way"},
                {"name": "Interrupted Array", "address": "2 Crash Way"},
                {"name": "Waiting Array", "address": "3 Waiting Way"},
            ]
        )
    )
    http_get = Mock(
        side_effect=[
            Mock(
                status_code=200,
                text=json.dumps(
                    [
                        {
                            "lat": "40.0",
                            "lon": "-75.0",
                            "display_name": "1 First Way, Pennsylvania",
                        }
                    ]
                ),
            ),
            RuntimeError("unexpected programming failure"),
        ]
    )
    monkeypatch.setattr(NOMINATIM_GATEWAY.session, "get", http_get)

    with pytest.raises(RuntimeError, match="unexpected programming failure"):
        call_command("import_sites", import_path, mode="upsert")

    first, interrupted, waiting = list(Site.objects.order_by("id"))
    assert first.geocode_status == GeocodeStatus.RESOLVED
    assert first.geocode_attempted_at is not None
    assert interrupted.geocode_status == GeocodeStatus.PENDING
    assert interrupted.geocode_attempted_at is None
    assert waiting.geocode_status == GeocodeStatus.PENDING
    assert waiting.geocode_attempted_at is None
    assert interrupted.solar_resource_status == ProcessingStatus.BLOCKED
    assert interrupted.pvwatts_status == ProcessingStatus.BLOCKED
    assert waiting.solar_resource_status == ProcessingStatus.BLOCKED
    assert waiting.pvwatts_status == ProcessingStatus.BLOCKED
    assert [call.kwargs["params"]["q"] for call in http_get.call_args_list] == [
        "1 First Way",
        "2 Crash Way",
    ]

    http_get.side_effect = None
    http_get.return_value = Mock(
        status_code=200,
        text=json.dumps(
            [
                {
                    "lat": "39.5",
                    "lon": "-76.5",
                    "display_name": "2 Crash Way, Maryland",
                }
            ]
        ),
    )
    geocode_site(interrupted)

    interrupted.refresh_from_db()
    assert interrupted.geocode_status == GeocodeStatus.RESOLVED
    assert interrupted.geocode_attempted_at is not None
    assert interrupted.latitude == 39.5
    assert interrupted.longitude == -76.5
    assert interrupted.resolved_address == "2 Crash Way, Maryland"


def test_gateway_spaces_request_starts_by_at_least_1_1_seconds(
    settings: Settings,
) -> None:
    settings.CONTACT_EMAIL = ""
    current_time = [100.0]
    sleeps: list[float] = []
    request_starts: list[float] = []
    session = Mock(spec=requests.Session)

    def monotonic() -> float:
        return current_time[0]

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        current_time[0] += seconds

    def get(*args: object, **kwargs: object) -> Mock:
        request_starts.append(monotonic())
        return Mock(status_code=200, text="[]")

    session.get.side_effect = get
    gateway = NominatimGateway(
        session,
        monotonic=monotonic,
        sleep=sleep,
    )

    gateway.search("First address")
    current_time[0] += 0.25
    gateway.search("Second address")

    assert request_starts == pytest.approx([100.0, 101.1])
    assert sleeps == pytest.approx([0.85])


def test_gateway_uses_a_descriptive_user_agent_and_warns_without_contact_email(
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings.CONTACT_EMAIL = ""
    session = Mock(spec=requests.Session)
    session.get.return_value = Mock(status_code=200, text="[]")
    gateway = NominatimGateway(session)

    gateway.search("100 Main St")

    assert session.get.call_args.kwargs["headers"] == {
        "User-Agent": "dispatch-solar-assessment/1.0 (interview take-home)"
    }
    assert "CONTACT_EMAIL is not configured" in caplog.text


def test_gateway_serializes_the_rate_gate_and_http_request(
    settings: Settings,
) -> None:
    settings.CONTACT_EMAIL = "solar@example.com"
    first_http_started = threading.Event()
    release_first_http = threading.Event()
    second_search_started = threading.Event()
    second_http_started = threading.Event()
    errors: list[BaseException] = []
    session = Mock(spec=requests.Session)

    def get(*args: object, **kwargs: object) -> Mock:
        params = kwargs["params"]
        assert isinstance(params, dict)
        if params["q"] == "First address":
            first_http_started.set()
            assert release_first_http.wait(timeout=1)
        else:
            second_http_started.set()
        return Mock(status_code=200, text="[]")

    session.get.side_effect = get
    gateway = NominatimGateway(
        session,
        monotonic=Mock(side_effect=[100.0, 101.2]),
        sleep=Mock(),
    )

    def search(address: str, started: threading.Event | None = None) -> None:
        try:
            if started is not None:
                started.set()
            gateway.search(address)
        except BaseException as error:
            errors.append(error)

    first_thread = threading.Thread(target=search, args=("First address",))
    second_thread = threading.Thread(
        target=search,
        args=("Second address", second_search_started),
    )
    first_thread.start()
    assert first_http_started.wait(timeout=1)
    second_thread.start()
    assert second_search_started.wait(timeout=1)
    assert second_http_started.wait(timeout=0.05) is False

    release_first_http.set()
    first_thread.join(timeout=1)
    second_thread.join(timeout=1)

    assert errors == []
    assert second_http_started.is_set()
    assert first_thread.is_alive() is False
    assert second_thread.is_alive() is False
