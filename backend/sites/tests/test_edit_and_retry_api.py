import json
from datetime import datetime, timezone
from unittest.mock import Mock

import pytest
import requests
from django.db import IntegrityError
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from sites.models import GeocodeStatus, ProcessingStatus, Site
from sites.services import pvwatts, solar_resource
from sites.services.constants import MONTHS
from sites.services.geocoding import NOMINATIM_GATEWAY

ATTEMPTED_AT = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)


def healthy_site(**overrides: object) -> Site:
    values: dict[str, object] = {
        "name": "Healthy Solar",
        "address": "100 Solar Way",
        "geocode_status": GeocodeStatus.RESOLVED,
        "geocode_attempted_at": ATTEMPTED_AT,
        "latitude": 40.0,
        "longitude": -105.0,
        "resolved_address": "100 Solar Way, Boulder, Colorado",
        "solar_resource_status": ProcessingStatus.SUCCEEDED,
        "annual_ghi_kwh_m2_day": 4.8,
        "annual_dni_kwh_m2_day": 6.0,
        "annual_latitude_tilt_kwh_m2_day": 5.8,
        "monthly_solar_data": [{"month": month} for month in MONTHS],
        "solar_resource_attempted_at": ATTEMPTED_AT,
        "pvwatts_status": ProcessingStatus.SUCCEEDED,
        "pvwatts_assumptions": {"system_capacity": 100},
        "annual_ac_kwh": 134_435.4,
        "capacity_factor_percent": 15.35,
        "annual_solar_radiation_kwh_m2_day": 4.78,
        "monthly_pvwatts_data": [{"month": month} for month in MONTHS],
        "pvwatts_attempted_at": ATTEMPTED_AT,
    }
    values.update(overrides)
    return Site.objects.create(**values)


def solar_payload() -> str:
    def metric(annual: float) -> dict[str, object]:
        return {
            "annual": annual,
            "monthly": {
                month: annual + index / 10 for index, month in enumerate(MONTHS)
            },
        }

    return json.dumps(
        {
            "warnings": [],
            "errors": [],
            "outputs": {
                "avg_ghi": metric(4.8),
                "avg_dni": metric(6.0),
                "avg_lat_tilt": metric(5.8),
            },
        }
    )


def pvwatts_payload() -> str:
    return json.dumps(
        {
            "warnings": [],
            "errors": [],
            "outputs": {
                "ac_monthly": [8_000 + index for index in range(12)],
                "solrad_monthly": [4 + index / 10 for index in range(12)],
                "ac_annual": 96_066,
                "solrad_annual": 4.55,
                "capacity_factor": 14.2,
            },
        }
    )


@pytest.mark.django_db
def test_patch_returns_all_payload_errors_without_mutation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = healthy_site()
    original_updated_at = site.updated_at
    process = Mock()
    monkeypatch.setattr("sites.views.process_site", process)

    response = APIClient().patch(
        f"/api/sites/{site.id}/",
        {"latitude": 1, "name": "---", "address": None},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "The PATCH payload is invalid.",
        "errors": {
            "unsupported_fields": ["latitude"],
            "name": ["Must be a non-empty string."],
            "address": ["Must be a non-empty string."],
        },
    }
    site.refresh_from_db()
    assert site.updated_at == original_updated_at
    process.assert_not_called()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("payload", "expected_errors"),
    [
        ({}, {"non_field_errors": ["At least one of name or address is required."]}),
        ([], {"non_field_errors": ["Expected a JSON object."]}),
        ("name", {"non_field_errors": ["Expected a JSON object."]}),
    ],
)
def test_patch_rejects_missing_or_non_object_payloads_before_side_effects(
    payload: object,
    expected_errors: dict[str, list[str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = healthy_site()
    original_updated_at = site.updated_at
    conflict_lookup = Mock()
    process = Mock()
    monkeypatch.setattr("sites.views._find_identity_conflict", conflict_lookup)
    monkeypatch.setattr("sites.views.process_site", process)

    response = APIClient().patch(f"/api/sites/{site.id}/", payload, format="json")

    assert response.status_code == 400
    assert response.json()["errors"] == expected_errors
    site.refresh_from_db()
    assert site.updated_at == original_updated_at
    conflict_lookup.assert_not_called()
    process.assert_not_called()


@pytest.mark.django_db
def test_exact_patch_is_a_true_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    site = healthy_site()
    original_updated_at = site.updated_at
    conflict_lookup = Mock()
    process = Mock()
    monkeypatch.setattr("sites.views._find_identity_conflict", conflict_lookup)
    monkeypatch.setattr("sites.views.process_site", process)

    response = APIClient().patch(
        f"/api/sites/{site.id}/",
        {"name": site.name, "address": site.address},
        format="json",
    )

    assert response.status_code == 200
    site.refresh_from_db()
    assert site.updated_at == original_updated_at
    conflict_lookup.assert_not_called()
    process.assert_not_called()


@pytest.mark.django_db
def test_cosmetic_edit_preserves_all_provider_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = healthy_site()
    original_state = {
        field: getattr(site, field)
        for field in (
            "latitude",
            "longitude",
            "resolved_address",
            "geocode_status",
            "geocode_attempted_at",
            "solar_resource_status",
            "monthly_solar_data",
            "solar_resource_attempted_at",
            "pvwatts_status",
            "monthly_pvwatts_data",
            "pvwatts_attempted_at",
        )
    }
    process = Mock()
    monkeypatch.setattr("sites.views.process_site", process)

    response = APIClient().patch(
        f"/api/sites/{site.id}/",
        {"name": "Healthy Solar, LLC", "address": "100 Solar Way."},
        format="json",
    )

    assert response.status_code == 200
    site.refresh_from_db()
    assert site.name == "Healthy Solar, LLC"
    assert site.address == "100 Solar Way."
    assert {field: getattr(site, field) for field in original_state} == original_state
    process.assert_not_called()


@pytest.mark.django_db
@pytest.mark.parametrize("conflict_active", [True, False])
def test_patch_reports_active_and_inactive_identity_conflicts(
    conflict_active: bool,
) -> None:
    site = healthy_site()
    conflict = healthy_site(
        name="Other Solar",
        address="2 Other Way",
        is_active=conflict_active,
    )

    response = APIClient().patch(
        f"/api/sites/{site.id}/",
        {"name": conflict.name, "address": conflict.address},
        format="json",
    )

    assert response.status_code == 409
    assert response.json()["conflict_site_id"] == conflict.id
    assert response.json()["conflict_is_active"] is conflict_active
    site.refresh_from_db()
    assert (site.name, site.address) == ("Healthy Solar", "100 Solar Way")


@pytest.mark.django_db
def test_confirmed_integrity_race_returns_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = healthy_site()
    conflict = healthy_site(name="Race Solar", address="9 Race Way")
    conflict_lookup = Mock(side_effect=[None, conflict])
    monkeypatch.setattr("sites.views._find_identity_conflict", conflict_lookup)
    monkeypatch.setattr(
        site.__class__, "save", Mock(side_effect=IntegrityError("unique race"))
    )

    response = APIClient().patch(
        f"/api/sites/{site.id}/",
        {"name": "Race Solar", "address": "9 Race Way"},
        format="json",
    )

    assert response.status_code == 409
    assert response.json()["conflict_site_id"] == conflict.id


@pytest.mark.django_db
def test_unrelated_integrity_error_propagates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = healthy_site()
    conflict_lookup = Mock(return_value=None)
    monkeypatch.setattr("sites.views._find_identity_conflict", conflict_lookup)
    monkeypatch.setattr(
        site.__class__, "save", Mock(side_effect=IntegrityError("unrelated constraint"))
    )

    with pytest.raises(IntegrityError, match="unrelated constraint"):
        APIClient().patch(
            f"/api/sites/{site.id}/",
            {"name": "Still Unique"},
            format="json",
        )

    assert conflict_lookup.call_count == 2


@pytest.mark.django_db(transaction=True)
def test_address_change_commits_invalidated_state_before_geocoding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = healthy_site()

    def crash_after_observing_committed_state(_: str) -> object:
        pending = Site.objects.get(pk=site.id)
        assert pending.address == "200 New Address"
        assert pending.geocode_status == GeocodeStatus.PENDING
        assert pending.latitude is None
        assert pending.geocode_attempted_at is None
        assert pending.solar_resource_status == ProcessingStatus.BLOCKED
        assert pending.monthly_solar_data is None
        assert pending.pvwatts_status == ProcessingStatus.BLOCKED
        assert pending.monthly_pvwatts_data is None
        raise RuntimeError("unexpected geocoder crash")

    monkeypatch.setattr(
        NOMINATIM_GATEWAY, "search", crash_after_observing_committed_state
    )

    with pytest.raises(RuntimeError, match="unexpected geocoder crash"):
        APIClient().patch(
            f"/api/sites/{site.id}/",
            {"address": "200 New Address"},
            format="json",
        )

    site.refresh_from_db()
    assert site.geocode_status == GeocodeStatus.PENDING
    assert site.geocode_attempted_at is None


@pytest.mark.django_db
def test_address_change_returns_handled_unresolved_detail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = healthy_site()
    monkeypatch.setattr(
        NOMINATIM_GATEWAY,
        "search",
        Mock(return_value=Mock(status_code=200, text="[]")),
    )

    response = APIClient().patch(
        f"/api/sites/{site.id}/",
        {"address": "200 Unmatched Address"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["address"] == "200 Unmatched Address"
    assert response.json()["geocode_status"] == "unresolved"
    assert response.json()["solar_resource_status"] == "blocked"
    assert response.json()["pvwatts_status"] == "blocked"
    assert response.json()["geocode_attempted_at"] is not None


@pytest.mark.django_db(transaction=True)
def test_geocode_refresh_clears_stale_state_and_keeps_it_cleared_when_unresolved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = healthy_site()

    def unresolved_after_commit(_: str) -> Mock:
        pending = Site.objects.get(pk=site.id)
        assert pending.geocode_status == GeocodeStatus.PENDING
        assert pending.latitude is None
        assert pending.solar_resource_status == ProcessingStatus.BLOCKED
        assert pending.pvwatts_status == ProcessingStatus.BLOCKED
        return Mock(status_code=200, text="[]")

    monkeypatch.setattr(NOMINATIM_GATEWAY, "search", unresolved_after_commit)

    response = APIClient().post(f"/api/sites/{site.id}/geocode/")

    assert response.status_code == 200
    assert response.json()["geocode_status"] == "unresolved"
    site.refresh_from_db()
    assert site.latitude is None
    assert site.longitude is None
    assert site.monthly_solar_data is None
    assert site.monthly_pvwatts_data is None
    assert site.solar_resource_status == ProcessingStatus.BLOCKED
    assert site.pvwatts_status == ProcessingStatus.BLOCKED


@pytest.mark.django_db
def test_geocode_refresh_converts_outage_to_safe_failure_without_stale_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = healthy_site()
    monkeypatch.setattr(NOMINATIM_GATEWAY, "search", Mock(side_effect=requests.Timeout))

    response = APIClient().post(f"/api/sites/{site.id}/geocode/")

    assert response.status_code == 200
    assert response.json()["geocode_status"] == "failed"
    assert response.json()["geocode_error"] == "Geocoding timed out after 10s"
    site.refresh_from_db()
    assert site.latitude is None
    assert site.resolved_address is None
    assert site.monthly_solar_data is None
    assert site.monthly_pvwatts_data is None
    assert site.solar_resource_status == ProcessingStatus.BLOCKED
    assert site.pvwatts_status == ProcessingStatus.BLOCKED


@pytest.mark.django_db
def test_geocode_refresh_returns_partial_downstream_outcome(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-key"
    site = healthy_site()
    monkeypatch.setattr(
        NOMINATIM_GATEWAY,
        "search",
        Mock(
            return_value=Mock(
                status_code=200,
                text=json.dumps(
                    [
                        {
                            "lat": "41.88",
                            "lon": "-87.63",
                            "display_name": "200 New Address, Chicago, Illinois",
                        }
                    ]
                ),
            )
        ),
    )
    monkeypatch.setattr(
        solar_resource,
        "request_solar_resource",
        Mock(return_value=Mock(status_code=503, text="provider unavailable")),
    )
    monkeypatch.setattr(
        pvwatts,
        "request_pvwatts",
        Mock(return_value=Mock(status_code=200, text=pvwatts_payload())),
    )

    response = APIClient().post(f"/api/sites/{site.id}/geocode/")

    assert response.status_code == 200
    assert response.json()["geocode_status"] == "resolved"
    assert response.json()["solar_resource_status"] == "failed"
    assert response.json()["pvwatts_status"] == "succeeded"
    site.refresh_from_db()
    assert (site.latitude, site.longitude) == (41.88, -87.63)
    assert site.solar_resource_error == "Solar Resource service returned HTTP 503"
    assert site.annual_ac_kwh == 96_066


@pytest.mark.django_db(transaction=True)
def test_geocode_refresh_recovers_from_an_earlier_crash(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-key"
    site = healthy_site()
    resolved = Mock(
        status_code=200,
        text=json.dumps(
            [
                {
                    "lat": "39.74",
                    "lon": "-104.99",
                    "display_name": "Recovered Address, Denver, Colorado",
                }
            ]
        ),
    )
    monkeypatch.setattr(
        NOMINATIM_GATEWAY,
        "search",
        Mock(side_effect=[RuntimeError("process crash"), resolved]),
    )
    monkeypatch.setattr(
        solar_resource,
        "request_solar_resource",
        Mock(return_value=Mock(status_code=200, text=solar_payload())),
    )
    monkeypatch.setattr(
        pvwatts,
        "request_pvwatts",
        Mock(return_value=Mock(status_code=200, text=pvwatts_payload())),
    )

    with pytest.raises(RuntimeError, match="process crash"):
        APIClient().post(f"/api/sites/{site.id}/geocode/")
    site.refresh_from_db()
    assert site.geocode_status == GeocodeStatus.PENDING
    assert site.geocode_attempted_at is None

    response = APIClient().post(f"/api/sites/{site.id}/geocode/")

    assert response.status_code == 200
    assert response.json()["geocode_status"] == "resolved"
    assert response.json()["solar_resource_status"] == "succeeded"
    assert response.json()["pvwatts_status"] == "succeeded"
    assert (response.json()["latitude"], response.json()["longitude"]) == (
        39.74,
        -104.99,
    )


@pytest.mark.django_db
def test_downstream_refresh_precondition_has_no_side_effects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    site = Site.objects.create(name="Pending Solar", address="1 Pending Way")
    original_updated_at = site.updated_at
    provider = Mock()
    monkeypatch.setattr(solar_resource, "request_solar_resource", provider)

    response = APIClient().post(f"/api/sites/{site.id}/solar-resource/")

    assert response.status_code == 409
    assert response.json()["geocode_status"] == "pending"
    site.refresh_from_db()
    assert site.updated_at == original_updated_at
    provider.assert_not_called()


@pytest.mark.django_db(transaction=True)
def test_solar_resource_refresh_replaces_only_solar_stage(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-key"
    site = healthy_site()
    pvwatts_state = {
        field: getattr(site, field)
        for field in (
            "pvwatts_status",
            "pvwatts_assumptions",
            "annual_ac_kwh",
            "monthly_pvwatts_data",
            "pvwatts_attempted_at",
        )
    }

    def response_after_pending(**_: object) -> Mock:
        pending = Site.objects.get(pk=site.id)
        assert pending.solar_resource_status == ProcessingStatus.PENDING
        assert pending.monthly_solar_data is None
        assert pending.solar_resource_attempted_at is None
        return Mock(status_code=200, text=solar_payload())

    monkeypatch.setattr(
        solar_resource, "request_solar_resource", response_after_pending
    )

    response = APIClient().post(f"/api/sites/{site.id}/solar-resource/")

    assert response.status_code == 200
    assert response.json()["solar_resource_status"] == "succeeded"
    site.refresh_from_db()
    assert {field: getattr(site, field) for field in pvwatts_state} == pvwatts_state


@pytest.mark.django_db(transaction=True)
def test_solar_resource_crash_leaves_only_solar_pending(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-key"
    site = healthy_site()
    pvwatts_state = (
        site.pvwatts_status,
        site.monthly_pvwatts_data,
        site.pvwatts_attempted_at,
    )

    def crash_after_pending(**_: object) -> object:
        pending = Site.objects.get(pk=site.id)
        assert pending.solar_resource_status == ProcessingStatus.PENDING
        assert pending.monthly_solar_data is None
        assert pending.solar_resource_attempted_at is None
        raise RuntimeError("unexpected Solar Resource crash")

    monkeypatch.setattr(solar_resource, "request_solar_resource", crash_after_pending)

    with pytest.raises(RuntimeError, match="unexpected Solar Resource crash"):
        APIClient().post(f"/api/sites/{site.id}/solar-resource/")

    site.refresh_from_db()
    assert site.solar_resource_status == ProcessingStatus.PENDING
    assert site.solar_resource_attempted_at is None
    assert (
        site.pvwatts_status,
        site.monthly_pvwatts_data,
        site.pvwatts_attempted_at,
    ) == pvwatts_state


@pytest.mark.django_db(transaction=True)
def test_pvwatts_refresh_returns_handled_failure_without_restoring_stale_values(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-key"
    site = healthy_site()
    solar_state = (
        site.solar_resource_status,
        site.monthly_solar_data,
        site.solar_resource_attempted_at,
    )

    def failure_after_pending(**_: object) -> Mock:
        pending = Site.objects.get(pk=site.id)
        assert pending.pvwatts_status == ProcessingStatus.PENDING
        assert pending.annual_ac_kwh is None
        assert pending.pvwatts_attempted_at is None
        return Mock(status_code=503, text="provider unavailable")

    monkeypatch.setattr(pvwatts, "request_pvwatts", failure_after_pending)

    response = APIClient().post(f"/api/sites/{site.id}/pvwatts/")

    assert response.status_code == 200
    assert response.json()["pvwatts_status"] == "failed"
    assert response.json()["pvwatts_error"] == "PVWatts service returned HTTP 503"
    assert response.json()["annual_ac_kwh"] is None
    site.refresh_from_db()
    assert (
        site.solar_resource_status,
        site.monthly_solar_data,
        site.solar_resource_attempted_at,
    ) == solar_state


@pytest.mark.django_db(transaction=True)
def test_pvwatts_crash_leaves_only_pvwatts_pending(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    settings.NLR_API_KEY = "test-key"
    site = healthy_site()
    solar_attempted_at = site.solar_resource_attempted_at

    def crash_after_pending(**_: object) -> object:
        pending = Site.objects.get(pk=site.id)
        assert pending.pvwatts_status == ProcessingStatus.PENDING
        assert pending.pvwatts_assumptions is None
        assert pending.pvwatts_attempted_at is None
        raise RuntimeError("unexpected PVWatts crash")

    monkeypatch.setattr(pvwatts, "request_pvwatts", crash_after_pending)

    with pytest.raises(RuntimeError, match="unexpected PVWatts crash"):
        APIClient().post(f"/api/sites/{site.id}/pvwatts/")

    site.refresh_from_db()
    assert site.pvwatts_status == ProcessingStatus.PENDING
    assert site.pvwatts_attempted_at is None
    assert site.solar_resource_status == ProcessingStatus.SUCCEEDED
    assert site.solar_resource_attempted_at == solar_attempted_at


@pytest.mark.django_db
@pytest.mark.parametrize(
    "suffix",
    ["", "geocode/", "solar-resource/", "pvwatts/"],
)
def test_inactive_site_edit_and_retry_endpoints_return_404(suffix: str) -> None:
    site = healthy_site(is_active=False)
    client = APIClient()

    response = (
        client.patch(f"/api/sites/{site.id}/", {"name": "Hidden"}, format="json")
        if not suffix
        else client.post(f"/api/sites/{site.id}/{suffix}")
    )

    assert response.status_code == 404
