from datetime import datetime, timezone

import pytest
from rest_framework.test import APIClient

from sites.models import GeocodeStatus, ProcessingStatus, Site
from sites.services.constants import MONTHS
from sites.services.pvwatts import PVWATTS_BASE_ASSUMPTIONS


@pytest.mark.django_db
def test_list_returns_only_active_sites_with_map_identity() -> None:
    attempted_at = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)
    pvwatts_months = [
        {
            "month": month,
            "ac_kwh": 8200.4 + index,
            "solar_radiation_kwh_m2_day": 4.1 + index,
        }
        for index, month in enumerate(MONTHS)
    ]
    resolved = Site.objects.create(
        name="Chicago Solar",
        address="200 W Washington St",
        geocode_status=GeocodeStatus.RESOLVED,
        geocode_attempted_at=attempted_at,
        latitude=41.8837,
        longitude=-87.6325,
        solar_resource_status=ProcessingStatus.SUCCEEDED,
        annual_ghi_kwh_m2_day=4.12,
        annual_dni_kwh_m2_day=5.23,
        annual_latitude_tilt_kwh_m2_day=4.88,
        solar_resource_attempted_at=attempted_at,
        pvwatts_status=ProcessingStatus.SUCCEEDED,
        annual_ac_kwh=140_234.5,
        monthly_pvwatts_data=pvwatts_months,
        pvwatts_attempted_at=attempted_at,
    )
    unresolved = Site.objects.create(
        name="Unknown Solar",
        address="Not a real U.S. address",
        geocode_status=GeocodeStatus.UNRESOLVED,
        geocode_attempted_at=attempted_at,
    )
    failed = Site.objects.create(
        name="Failed Solar",
        address="10 Provider Error Ave",
        geocode_status=GeocodeStatus.FAILED,
        geocode_error="Geocoding timed out after 10s",
        geocode_attempted_at=attempted_at,
    )
    Site.objects.create(
        name="Inactive Solar",
        address="1 Retired Way",
        is_active=False,
    )

    response = APIClient().get("/api/sites/")

    assert response.status_code == 200
    no_results = {
        "solar_resource_status": "blocked",
        "annual_ghi_kwh_m2_day": None,
        "annual_dni_kwh_m2_day": None,
        "annual_latitude_tilt_kwh_m2_day": None,
        "pvwatts_status": "blocked",
        "annual_ac_kwh": None,
        "monthly_pvwatts_data": None,
    }
    assert response.json() == [
        {
            "id": resolved.id,
            "name": "Chicago Solar",
            "address": "200 W Washington St",
            "latitude": 41.8837,
            "longitude": -87.6325,
            "geocode_status": "resolved",
            "solar_resource_status": "succeeded",
            "annual_ghi_kwh_m2_day": 4.12,
            "annual_dni_kwh_m2_day": 5.23,
            "annual_latitude_tilt_kwh_m2_day": 4.88,
            "pvwatts_status": "succeeded",
            "annual_ac_kwh": 140_234.5,
            "monthly_pvwatts_data": pvwatts_months,
        },
        {
            "id": unresolved.id,
            "name": "Unknown Solar",
            "address": "Not a real U.S. address",
            "latitude": None,
            "longitude": None,
            "geocode_status": "unresolved",
            **no_results,
        },
        {
            "id": failed.id,
            "name": "Failed Solar",
            "address": "10 Provider Error Ave",
            "latitude": None,
            "longitude": None,
            "geocode_status": "failed",
            **no_results,
        },
    ]


@pytest.mark.django_db
def test_detail_returns_complete_canonical_site_state() -> None:
    attempted_at = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)
    pvwatts_months = [
        {
            "month": month,
            "ac_kwh": 8200.4 + index,
            "solar_radiation_kwh_m2_day": 4.1 + index,
        }
        for index, month in enumerate(MONTHS)
    ]
    assumptions = {
        **PVWATTS_BASE_ASSUMPTIONS,
        "tilt": 41.9,
        "lat": 41.8837,
        "lon": -87.6325,
        "endpoint": "pvwatts",
        "version": "v8",
    }
    site = Site.objects.create(
        name="Chicago Solar",
        address="200 W Washington St",
        latitude=41.8837,
        longitude=-87.6325,
        resolved_address="200 West Washington Street, Chicago, Illinois",
        geocode_status=GeocodeStatus.RESOLVED,
        geocode_attempted_at=attempted_at,
        solar_resource_status=ProcessingStatus.FAILED,
        solar_resource_error="Solar Resource service returned HTTP 503",
        solar_resource_attempted_at=attempted_at,
        pvwatts_status=ProcessingStatus.SUCCEEDED,
        pvwatts_assumptions=assumptions,
        annual_ac_kwh=140_234.5,
        capacity_factor_percent=16.0,
        annual_solar_radiation_kwh_m2_day=4.7,
        monthly_pvwatts_data=pvwatts_months,
        pvwatts_attempted_at=attempted_at,
    )

    response = APIClient().get(f"/api/sites/{site.id}/")

    assert response.status_code == 200
    payload = response.json()
    created_at = payload.pop("created_at")
    updated_at = payload.pop("updated_at")
    assert datetime.fromisoformat(created_at.replace("Z", "+00:00")).tzinfo is not None
    assert datetime.fromisoformat(updated_at.replace("Z", "+00:00")).tzinfo is not None
    assert [item["month"] for item in payload["monthly_pvwatts_data"]] == list(MONTHS)
    assert payload == {
        "id": site.id,
        "name": "Chicago Solar",
        "address": "200 W Washington St",
        "is_active": True,
        "latitude": 41.8837,
        "longitude": -87.6325,
        "resolved_address": "200 West Washington Street, Chicago, Illinois",
        "geocode_status": "resolved",
        "geocode_error": None,
        "geocode_attempted_at": "2026-08-23T12:30:00Z",
        "solar_resource_status": "failed",
        "annual_ghi_kwh_m2_day": None,
        "annual_dni_kwh_m2_day": None,
        "annual_latitude_tilt_kwh_m2_day": None,
        "monthly_solar_data": None,
        "solar_resource_error": "Solar Resource service returned HTTP 503",
        "solar_resource_attempted_at": "2026-08-23T12:30:00Z",
        "pvwatts_status": "succeeded",
        "pvwatts_assumptions": assumptions,
        "annual_ac_kwh": 140_234.5,
        "capacity_factor_percent": 16.0,
        "annual_solar_radiation_kwh_m2_day": 4.7,
        "monthly_pvwatts_data": pvwatts_months,
        "pvwatts_error": None,
        "pvwatts_attempted_at": "2026-08-23T12:30:00Z",
    }


@pytest.mark.django_db
def test_detail_serializes_canonical_solar_resource_data() -> None:
    attempted_at = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)
    solar_months = [
        {
            "month": month,
            "ghi_kwh_m2_day": 2.5 + index,
            "dni_kwh_m2_day": 5.0 + index,
            "latitude_tilt_kwh_m2_day": 4.79 + index,
        }
        for index, month in enumerate(MONTHS)
    ]
    site = Site.objects.create(
        name="Solar Resource Site",
        address="100 Resource Way",
        latitude=41.8837,
        longitude=-87.6325,
        resolved_address="100 Resource Way, Chicago, Illinois",
        geocode_status=GeocodeStatus.RESOLVED,
        geocode_attempted_at=attempted_at,
        solar_resource_status=ProcessingStatus.SUCCEEDED,
        annual_ghi_kwh_m2_day=4.12,
        annual_dni_kwh_m2_day=5.23,
        annual_latitude_tilt_kwh_m2_day=4.88,
        monthly_solar_data=solar_months,
        solar_resource_attempted_at=attempted_at,
    )

    response = APIClient().get(f"/api/sites/{site.id}/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["solar_resource_status"] == "succeeded"
    assert payload["annual_ghi_kwh_m2_day"] == 4.12
    assert payload["annual_dni_kwh_m2_day"] == 5.23
    assert payload["annual_latitude_tilt_kwh_m2_day"] == 4.88
    assert payload["monthly_solar_data"] == solar_months
    assert [item["month"] for item in payload["monthly_solar_data"]] == list(MONTHS)
    assert payload["solar_resource_error"] is None
    assert payload["solar_resource_attempted_at"] == "2026-08-23T12:30:00Z"


@pytest.mark.django_db
def test_inactive_site_detail_is_not_exposed() -> None:
    site = Site.objects.create(
        name="Inactive Solar",
        address="1 Retired Way",
        is_active=False,
    )

    response = APIClient().get(f"/api/sites/{site.id}/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_get_endpoints_and_unsupported_methods_do_not_mutate() -> None:
    site = Site.objects.create(name="Stable Solar", address="1 Stable Way")
    original_updated_at = site.updated_at
    client = APIClient()

    assert client.get("/api/sites/").status_code == 200
    assert client.get(f"/api/sites/{site.id}/").status_code == 200
    assert client.post("/api/sites/", {}).status_code == 405
    assert client.put(f"/api/sites/{site.id}/", {"name": "Changed"}).status_code == 405
    assert client.delete(f"/api/sites/{site.id}/").status_code == 405

    site.refresh_from_db()
    assert site.updated_at == original_updated_at
    assert site.geocode_status == GeocodeStatus.PENDING


@pytest.mark.django_db
def test_cors_allows_only_expected_local_frontend_origins() -> None:
    client = APIClient()

    localhost_response = client.get("/api/sites/", HTTP_ORIGIN="http://localhost:3000")
    loopback_response = client.get("/api/sites/", HTTP_ORIGIN="http://127.0.0.1:3000")
    disallowed_response = client.get("/api/sites/", HTTP_ORIGIN="http://localhost:3001")

    assert localhost_response.headers["access-control-allow-origin"] == (
        "http://localhost:3000"
    )
    assert loopback_response.headers["access-control-allow-origin"] == (
        "http://127.0.0.1:3000"
    )
    assert "access-control-allow-credentials" not in localhost_response.headers
    assert "access-control-allow-origin" not in disallowed_response.headers
