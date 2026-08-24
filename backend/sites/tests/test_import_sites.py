import json
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from unittest.mock import Mock

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection

from sites.models import GeocodeStatus, ProcessingStatus, Site
from sites.services.geocoding import NominatimGateway

PROJECT_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def nominatim_http_boundary(
    monkeypatch: pytest.MonkeyPatch,
    isolated_nominatim_gateway: NominatimGateway,
) -> None:
    monkeypatch.setattr(
        isolated_nominatim_gateway.session,
        "get",
        Mock(return_value=Mock(status_code=200, text="[]")),
    )


@pytest.mark.django_db
def test_upsert_import_creates_and_geocodes_a_new_site(
    tmp_path: Path,
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {
                    "name": "  Chicago Sample—West  ",
                    "address": "  121 N. LaSalle St., Chicago, IL 60602  ",
                }
            ]
        )
    )

    call_command("import_sites", import_path, mode="upsert")

    site = Site.objects.get()
    assert site.name == "  Chicago Sample—West  "
    assert site.address == "  121 N. LaSalle St., Chicago, IL 60602  "
    assert site.normalized_name == "chicago sample west"
    assert site.normalized_address == "121 n lasalle st chicago il 60602"
    assert site.is_active is True
    assert site.geocode_status == GeocodeStatus.UNRESOLVED
    assert site.geocode_error == (
        "No matching U.S. location was found for this address."
    )
    assert site.geocode_attempted_at is not None
    assert site.solar_resource_status == ProcessingStatus.BLOCKED
    assert site.pvwatts_status == ProcessingStatus.BLOCKED


@pytest.mark.django_db
def test_import_rejects_malformed_json_without_creating_sites(tmp_path: Path) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text('[{"name": "Broken"')

    with pytest.raises(CommandError, match=r"Invalid JSON in .+sites\.json"):
        call_command("import_sites", import_path, mode="upsert")

    assert Site.objects.count() == 0


@pytest.mark.django_db
def test_import_reports_an_unreadable_input_file(tmp_path: Path) -> None:
    missing_path = tmp_path / "missing.json"

    with pytest.raises(CommandError, match=r"Could not read .+missing\.json"):
        call_command("import_sites", missing_path, mode="upsert")

    assert Site.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize("document", [{"name": "Not a list"}, None, "sites"])
def test_import_rejects_unsupported_top_level_data(
    tmp_path: Path, document: object
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(json.dumps(document))

    with pytest.raises(CommandError, match="top level must be a JSON array"):
        call_command("import_sites", import_path, mode="upsert")

    assert Site.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("invalid_row", "expected_errors"),
    [
        ("not an object", ("row must be an object",)),
        ({}, ("name is required", "address is required")),
        ({"name": None, "address": "1 Main St"}, ("name must be a non-empty string",)),
        ({"name": 7, "address": "1 Main St"}, ("name must be a non-empty string",)),
        ({"name": "   ", "address": "1 Main St"}, ("name must be a non-empty string",)),
        (
            {"name": "...", "address": "1 Main St"},
            ("name must normalize to a non-empty value",),
        ),
        ({"name": "Invalid"}, ("address is required",)),
        ({"name": "Invalid", "address": None}, ("address must be a non-empty string",)),
        (
            {"name": "Invalid", "address": ["1 Main St"]},
            ("address must be a non-empty string",),
        ),
        ({"name": "Invalid", "address": "\t"}, ("address must be a non-empty string",)),
        (
            {"name": "Invalid", "address": "---"},
            ("address must normalize to a non-empty value",),
        ),
    ],
)
def test_upsert_reports_invalid_row_and_continues_with_valid_rows(
    tmp_path: Path,
    invalid_row: object,
    expected_errors: tuple[str, ...],
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                invalid_row,
                {"name": "Valid Site", "address": "1 Main St, Albany, NY"},
            ]
        )
    )
    stderr = StringIO()

    call_command("import_sites", import_path, mode="upsert", stderr=stderr)

    assert list(Site.objects.values_list("name", flat=True)) == ["Valid Site"]
    assert "Row 1 rejected:" in stderr.getvalue()
    for expected_error in expected_errors:
        assert expected_error in stderr.getvalue()


@pytest.mark.django_db
def test_upsert_skips_later_normalized_pair_duplicates(tmp_path: Path) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "Solar—One", "address": "12-14 Main St."},
                {"name": " solar one ", "address": "12 14 MAIN ST"},
                {"name": "Solar Two", "address": "20 Main St"},
            ]
        )
    )
    stderr = StringIO()

    call_command("import_sites", import_path, mode="upsert", stderr=stderr)

    assert list(Site.objects.values_list("name", "address")) == [
        ("Solar—One", "12-14 Main St."),
        ("Solar Two", "20 Main St"),
    ]
    assert "Row 2 skipped: duplicate normalized name/address pair" in stderr.getvalue()


@pytest.mark.django_db
def test_repeated_upsert_leaves_active_exact_match_unchanged(tmp_path: Path) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Solar—One", "address": "12-14 Main St."}])
    )
    call_command("import_sites", import_path, mode="upsert")
    before = Site.objects.values().get()

    import_path.write_text(
        json.dumps([{"name": " solar one ", "address": "12 14 MAIN ST"}])
    )
    call_command("import_sites", import_path, mode="upsert")

    assert Site.objects.count() == 1
    assert Site.objects.values().get() == before


@pytest.mark.django_db
def test_upsert_reactivates_exact_match_without_resetting_provider_state(
    tmp_path: Path,
) -> None:
    attempted_at = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)
    site = Site.objects.create(
        name="Stored Solar—One",
        address="12-14 Main St.",
        is_active=False,
        geocode_status=GeocodeStatus.RESOLVED,
        latitude=42.65,
        longitude=-73.75,
        resolved_address="12-14 Main Street, Albany, New York",
        geocode_attempted_at=attempted_at,
        solar_resource_status=ProcessingStatus.FAILED,
        solar_resource_error="Solar Resource service returned HTTP 503",
        solar_resource_attempted_at=attempted_at,
        pvwatts_status=ProcessingStatus.SUCCEEDED,
        pvwatts_assumptions={"system_capacity": 100},
        annual_ac_kwh=140_234.5,
        capacity_factor_percent=16.0,
        annual_solar_radiation_kwh_m2_day=4.7,
        monthly_pvwatts_data=[{"month": "jan", "ac_kwh": 8200.4}],
        pvwatts_attempted_at=attempted_at,
    )
    before = Site.objects.filter(pk=site.pk).values().get()
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": " stored solar one ", "address": "12 14 MAIN ST"}])
    )

    call_command("import_sites", import_path, mode="upsert")

    after = Site.objects.filter(pk=site.pk).values().get()
    expected = {**before, "is_active": True, "updated_at": after["updated_at"]}
    assert after == expected
    assert after["updated_at"] > before["updated_at"]


@pytest.mark.django_db
def test_upsert_is_additive_and_reports_an_outcome_summary(tmp_path: Path) -> None:
    retained_site = Site.objects.create(
        name="Retained Site",
        address="100 Existing Ave, Boston, MA",
    )
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "New Site", "address": "200 New Ave, Denver, CO"}])
    )
    stdout = StringIO()

    call_command("import_sites", import_path, mode="upsert", stdout=stdout)

    retained_site.refresh_from_db()
    assert retained_site.is_active is True
    assert set(Site.objects.values_list("name", flat=True)) == {
        "Retained Site",
        "New Site",
    }
    assert stdout.getvalue() == (
        "Import complete: 1 created, 0 reactivated, 0 unchanged, "
        "0 duplicate rows skipped, 0 rejected.\n"
    )


@pytest.mark.django_db
def test_upsert_warns_about_partial_identity_matches_without_merging(
    tmp_path: Path,
) -> None:
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "North Array", "address": "1 Main St"},
                {"name": "South Array", "address": "1 Main St."},
                {"name": "North Array", "address": "2 Main St"},
            ]
        )
    )
    stderr = StringIO()

    call_command("import_sites", import_path, mode="upsert", stderr=stderr)

    assert Site.objects.count() == 3
    assert set(Site.objects.values_list("normalized_name", "normalized_address")) == {
        ("north array", "1 main st"),
        ("south array", "1 main st"),
        ("north array", "2 main st"),
    }
    assert (
        "Row 2 warning: normalized address is already used under a different "
        "normalized name" in stderr.getvalue()
    )
    assert (
        "Row 3 warning: normalized name is already used with a different "
        "normalized address" in stderr.getvalue()
    )


@pytest.mark.django_db
def test_replaceable_initial_dataset_imports_at_least_five_named_us_sites() -> None:
    call_command(
        "import_sites",
        PROJECT_ROOT / "data" / "sites_initial.json",
        mode="upsert",
    )

    sites = list(Site.objects.all())
    assert len(sites) >= 5
    assert all(site.name and site.address for site in sites)


@pytest.mark.django_db
def test_sync_invalid_row_leaves_all_lifecycle_state_unchanged(tmp_path: Path) -> None:
    active = Site.objects.create(name="Active", address="1 Main St")
    inactive = Site.objects.create(
        name="Inactive", address="2 Main St", is_active=False
    )
    before = list(Site.objects.order_by("id").values())
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "Replacement", "address": "3 Main St"},
                {"name": "...", "address": "4 Main St"},
            ]
        )
    )

    with pytest.raises(CommandError, match="Sync aborted: row 2"):
        call_command("import_sites", import_path, mode="sync")

    assert list(Site.objects.order_by("id").values()) == before
    assert Site.objects.get(pk=active.pk).is_active is True
    assert Site.objects.get(pk=inactive.pk).is_active is False


@pytest.mark.django_db(transaction=True)
def test_sync_reconciles_every_lifecycle_transition_before_processing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    retained = Site.objects.create(name="Retained", address="1 Main St")
    reactivated = Site.objects.create(
        name="Stored Reactivated",
        address="2 Main St",
        is_active=False,
        geocode_status=GeocodeStatus.FAILED,
        geocode_error="Stored failure",
        geocode_attempted_at=datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc),
    )
    omitted = Site.objects.create(name="Omitted", address="3 Main St")
    reactivated_before = Site.objects.values().get(pk=reactivated.pk)
    observed: list[tuple[tuple[int, ...], set[tuple[str, bool]], bool]] = []

    def observe_processing(site_ids: tuple[int, ...]) -> None:
        observed.append(
            (
                site_ids,
                set(Site.objects.values_list("name", "is_active")),
                connection.in_atomic_block,
            )
        )

    monkeypatch.setattr(
        "sites.management.commands.import_sites.process_new_sites",
        observe_processing,
    )
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "Retained", "address": "1 Main St"},
                {"name": " stored reactivated ", "address": "2 MAIN ST."},
                {"name": "New Site", "address": "4 Main St"},
                {"name": "new-site", "address": "4 Main St."},
            ]
        )
    )

    call_command("import_sites", import_path, mode="sync")

    created = Site.objects.get(name="New Site")
    assert observed == [
        (
            (created.id,),
            {
                ("Retained", True),
                ("Stored Reactivated", True),
                ("Omitted", False),
                ("New Site", True),
            },
            False,
        )
    ]
    reactivated.refresh_from_db()
    reactivated_after = Site.objects.values().get(pk=reactivated.pk)
    expected = {
        **reactivated_before,
        "is_active": True,
        "updated_at": reactivated_after["updated_at"],
    }
    assert reactivated_after == expected
    retained.refresh_from_db()
    omitted.refresh_from_db()
    assert retained.is_active is True
    assert omitted.is_active is False


@pytest.mark.django_db(transaction=True)
def test_sync_replacement_pair_is_new_and_survives_processing_crash(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    old = Site.objects.create(name="Original", address="1 Main St")

    def crash_after_reconciliation(site_ids: tuple[int, ...]) -> None:
        assert len(site_ids) == 1
        assert Site.objects.get(pk=old.pk).is_active is False
        assert Site.objects.get(pk=site_ids[0]).is_active is True
        raise RuntimeError("unexpected provider bug")

    monkeypatch.setattr(
        "sites.management.commands.import_sites.process_new_sites",
        crash_after_reconciliation,
    )
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps([{"name": "Original", "address": "99 Replacement Ave"}])
    )

    with pytest.raises(RuntimeError, match="unexpected provider bug"):
        call_command("import_sites", import_path, mode="sync")

    old.refresh_from_db()
    replacement = Site.objects.exclude(pk=old.pk).get()
    assert old.is_active is False
    assert replacement.is_active is True
    assert replacement.geocode_status == GeocodeStatus.PENDING


@pytest.mark.django_db
def test_sync_reports_duplicates_and_partial_identity_matches(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "sites.management.commands.import_sites.process_new_sites", Mock()
    )
    import_path = tmp_path / "sites.json"
    import_path.write_text(
        json.dumps(
            [
                {"name": "North Array", "address": "1 Main St"},
                {"name": " north-array ", "address": "1 MAIN ST."},
                {"name": "South Array", "address": "1 Main St."},
                {"name": "North Array", "address": "2 Main St"},
            ]
        )
    )
    stderr = StringIO()
    stdout = StringIO()

    call_command("import_sites", import_path, mode="sync", stderr=stderr, stdout=stdout)

    assert Site.objects.count() == 3
    assert "Row 2 skipped: duplicate normalized name/address pair" in stderr.getvalue()
    assert "normalized address is already used under a different normalized name" in (
        stderr.getvalue()
    )
    assert "normalized name is already used with a different normalized address" in (
        stderr.getvalue()
    )
    assert "1 duplicate rows skipped" in stdout.getvalue()
