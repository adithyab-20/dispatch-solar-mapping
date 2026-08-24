from datetime import datetime, timezone

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from sites.models import GeocodeStatus, ProcessingStatus, Site
from sites.services.constants import MONTHS
from sites.services.pvwatts import PVWATTS_BASE_ASSUMPTIONS


@pytest.mark.django_db
def test_site_preserves_display_values_and_builds_normalized_identity() -> None:
    site = Site.objects.create(
        name="  Chicago Solar—West  ",
        address="  200 W. Washington St. ",
    )

    assert site.name == "  Chicago Solar—West  "
    assert site.address == "  200 W. Washington St. "
    assert site.normalized_name == "chicago solar west"
    assert site.normalized_address == "200 w washington st"
    assert site.is_active is True
    assert site.geocode_status == GeocodeStatus.PENDING
    assert site.solar_resource_status == ProcessingStatus.BLOCKED
    assert site.pvwatts_status == ProcessingStatus.BLOCKED


@pytest.mark.django_db
def test_site_rejects_display_values_that_normalize_to_empty() -> None:
    with pytest.raises(ValidationError) as exc_info:
        Site.objects.create(name="...", address="---")

    assert exc_info.value.message_dict == {
        "name": ["Must contain at least one non-punctuation character."],
        "address": ["Must contain at least one non-punctuation character."],
    }


@pytest.mark.django_db
def test_normalized_pair_is_unique_across_active_and_inactive_sites() -> None:
    Site.objects.create(
        name="Chicago Solar—West",
        address="200 W. Washington St.",
        is_active=False,
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        Site.objects.create(
            name="chicago solar west",
            address="200 W Washington St",
        )


@pytest.mark.django_db
def test_name_and_address_are_not_independently_unique() -> None:
    Site.objects.create(name="Warehouse", address="10 Main St")
    Site.objects.create(name="Warehouse", address="20 Main St")
    Site.objects.create(name="Canopy", address="10 Main St")

    assert Site.objects.count() == 3


@pytest.mark.django_db
def test_site_can_store_complete_resolved_provider_state() -> None:
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
        solar_resource_status=ProcessingStatus.SUCCEEDED,
        annual_ghi_kwh_m2_day=4.12,
        annual_dni_kwh_m2_day=5.23,
        annual_latitude_tilt_kwh_m2_day=4.88,
        monthly_solar_data=solar_months,
        solar_resource_attempted_at=attempted_at,
        pvwatts_status=ProcessingStatus.SUCCEEDED,
        pvwatts_assumptions=assumptions,
        annual_ac_kwh=140_234.5,
        capacity_factor_percent=16.0,
        annual_solar_radiation_kwh_m2_day=4.7,
        monthly_pvwatts_data=pvwatts_months,
        pvwatts_attempted_at=attempted_at,
    )

    site.refresh_from_db()
    assert site.resolved_address == "200 West Washington Street, Chicago, Illinois"
    assert site.monthly_solar_data is not None
    assert site.monthly_pvwatts_data is not None
    assert [item["month"] for item in site.monthly_solar_data] == list(MONTHS)
    assert [item["month"] for item in site.monthly_pvwatts_data] == list(MONTHS)
    assert site.monthly_solar_data == solar_months
    assert site.monthly_pvwatts_data == pvwatts_months
    assert site.pvwatts_assumptions == assumptions
    assert site.geocode_attempted_at == attempted_at
    assert site.solar_resource_attempted_at == attempted_at
    assert site.pvwatts_attempted_at == attempted_at


def test_processing_state_vocabulary_is_exact() -> None:
    assert set(GeocodeStatus.values) == {
        "pending",
        "resolved",
        "unresolved",
        "failed",
    }
    assert set(ProcessingStatus.values) == {
        "blocked",
        "pending",
        "succeeded",
        "failed",
    }


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("status", "latitude", "longitude"),
    [
        (GeocodeStatus.PENDING, 41.0, -87.0),
        (GeocodeStatus.UNRESOLVED, 41.0, -87.0),
        (GeocodeStatus.FAILED, 41.0, -87.0),
        (GeocodeStatus.RESOLVED, None, None),
        (GeocodeStatus.RESOLVED, 41.0, None),
        (GeocodeStatus.RESOLVED, None, -87.0),
        (GeocodeStatus.RESOLVED, 90.01, 0.0),
        (GeocodeStatus.RESOLVED, -90.01, 0.0),
        (GeocodeStatus.RESOLVED, 0.0, 180.01),
        (GeocodeStatus.RESOLVED, 0.0, -180.01),
        (GeocodeStatus.RESOLVED, float("inf"), 0.0),
        (GeocodeStatus.RESOLVED, float("nan"), 0.0),
    ],
)
def test_database_rejects_inconsistent_or_out_of_range_coordinates(
    status: str, latitude: float | None, longitude: float | None
) -> None:
    attempted_at = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)
    with pytest.raises(IntegrityError), transaction.atomic():
        Site.objects.create(
            name=f"Invalid {status} {latitude} {longitude}",
            address="1 Invalid Way",
            geocode_status=status,
            geocode_attempted_at=(
                None if status == GeocodeStatus.PENDING else attempted_at
            ),
            latitude=latitude,
            longitude=longitude,
        )


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(-90.0, -180.0), (0.0, 0.0), (90.0, 180.0)],
)
def test_database_accepts_resolved_coordinates_at_valid_boundaries(
    latitude: float, longitude: float
) -> None:
    site = Site.objects.create(
        name=f"Boundary {latitude} {longitude}",
        address="1 Valid Way",
        geocode_status=GeocodeStatus.RESOLVED,
        geocode_attempted_at=datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc),
        latitude=latitude,
        longitude=longitude,
    )

    assert (site.latitude, site.longitude) == (latitude, longitude)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("geocode_status", "unknown"),
        ("solar_resource_status", "unknown"),
        ("pvwatts_status", "unknown"),
    ],
)
def test_database_rejects_unknown_processing_states(field: str, value: str) -> None:
    values = {field: value}
    with pytest.raises(IntegrityError), transaction.atomic():
        Site.objects.create(name=f"Invalid {field}", address="2 Invalid Way", **values)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "geocode_status",
    [GeocodeStatus.PENDING, GeocodeStatus.UNRESOLVED, GeocodeStatus.FAILED],
)
@pytest.mark.parametrize(
    "status_field",
    ["solar_resource_status", "pvwatts_status"],
)
@pytest.mark.parametrize(
    "processing_status",
    [ProcessingStatus.PENDING, ProcessingStatus.SUCCEEDED, ProcessingStatus.FAILED],
)
def test_database_blocks_downstream_work_until_geocoding_resolves(
    geocode_status: str,
    status_field: str,
    processing_status: str,
) -> None:
    attempted_at = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)
    values: dict[str, object] = {
        "geocode_status": geocode_status,
        "geocode_attempted_at": (
            None if geocode_status == GeocodeStatus.PENDING else attempted_at
        ),
        status_field: processing_status,
    }
    if processing_status in {ProcessingStatus.SUCCEEDED, ProcessingStatus.FAILED}:
        values[status_field.replace("status", "attempted_at")] = attempted_at

    with pytest.raises(IntegrityError), transaction.atomic():
        Site.objects.create(
            name=f"Invalid {geocode_status} {status_field} {processing_status}",
            address="3 Invalid Way",
            **values,
        )


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("status_field", "attempted_at_field", "status", "attempted_at_is_set"),
    [
        ("geocode_status", "geocode_attempted_at", GeocodeStatus.PENDING, True),
        ("geocode_status", "geocode_attempted_at", GeocodeStatus.RESOLVED, False),
        (
            "geocode_status",
            "geocode_attempted_at",
            GeocodeStatus.UNRESOLVED,
            False,
        ),
        ("geocode_status", "geocode_attempted_at", GeocodeStatus.FAILED, False),
        (
            "solar_resource_status",
            "solar_resource_attempted_at",
            ProcessingStatus.BLOCKED,
            True,
        ),
        (
            "solar_resource_status",
            "solar_resource_attempted_at",
            ProcessingStatus.PENDING,
            True,
        ),
        (
            "solar_resource_status",
            "solar_resource_attempted_at",
            ProcessingStatus.SUCCEEDED,
            False,
        ),
        (
            "solar_resource_status",
            "solar_resource_attempted_at",
            ProcessingStatus.FAILED,
            False,
        ),
        (
            "pvwatts_status",
            "pvwatts_attempted_at",
            ProcessingStatus.BLOCKED,
            True,
        ),
        (
            "pvwatts_status",
            "pvwatts_attempted_at",
            ProcessingStatus.PENDING,
            True,
        ),
        (
            "pvwatts_status",
            "pvwatts_attempted_at",
            ProcessingStatus.SUCCEEDED,
            False,
        ),
        (
            "pvwatts_status",
            "pvwatts_attempted_at",
            ProcessingStatus.FAILED,
            False,
        ),
    ],
)
def test_database_enforces_attempt_timestamp_semantics(
    status_field: str,
    attempted_at_field: str,
    status: str,
    attempted_at_is_set: bool,
) -> None:
    handled_at = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)
    values: dict[str, object] = {
        "geocode_status": GeocodeStatus.RESOLVED,
        "geocode_attempted_at": handled_at,
        "latitude": 41.8837,
        "longitude": -87.6325,
        status_field: status,
        attempted_at_field: handled_at if attempted_at_is_set else None,
    }
    if status_field == "geocode_status":
        values["latitude"] = 41.8837 if status == GeocodeStatus.RESOLVED else None
        values["longitude"] = -87.6325 if status == GeocodeStatus.RESOLVED else None

    with pytest.raises(IntegrityError), transaction.atomic():
        Site.objects.create(
            name=f"Invalid timestamp {status_field} {status}",
            address="4 Invalid Way",
            **values,
        )
