from unittest.mock import Mock

import pytest
from rest_framework.test import APIClient

from sites.models import GeocodeStatus, Site
from sites.services.geocoding import NominatimGateway


@pytest.fixture(autouse=True)
def nominatim_http_boundary(
    monkeypatch: pytest.MonkeyPatch,
    isolated_nominatim_gateway: NominatimGateway,
) -> None:
    """Keep the import pipeline offline: every geocode returns "no match"."""
    monkeypatch.setattr(
        isolated_nominatim_gateway.session,
        "get",
        Mock(return_value=Mock(status_code=200, text="[]")),
    )


# --- POST /api/sites/import/ -------------------------------------------------


@pytest.mark.django_db
def test_upsert_import_creates_sites_and_runs_pipeline_for_new_only() -> None:
    existing = Site.objects.create(name="Existing", address="1 Old Rd")

    response = APIClient().post(
        "/api/sites/import/",
        {
            "mode": "upsert",
            "sites": [
                {"name": "Existing", "address": "1 Old Rd"},
                {"name": "New Site", "address": "500 New Ave"},
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["created_count"] == 1
    assert body["unchanged_count"] == 1
    assert "1 created" in body["summary"]

    new_site = Site.objects.get(name="New Site")
    assert new_site.geocode_status == GeocodeStatus.UNRESOLVED
    assert new_site.geocode_attempted_at is not None

    existing.refresh_from_db()
    assert existing.geocode_status == GeocodeStatus.PENDING
    assert existing.geocode_attempted_at is None


@pytest.mark.django_db
def test_sync_mode_is_rejected_and_leaves_the_active_list_untouched() -> None:
    # Sync is a terminal-only operation (the import_sites --sync command); the
    # browser front door never deactivates sites the uploader did not list.
    keep = Site.objects.create(name="Keep", address="1 Keep St")
    drop = Site.objects.create(name="Drop", address="2 Drop St")

    response = APIClient().post(
        "/api/sites/import/",
        {"mode": "sync", "sites": [{"name": "Keep", "address": "1 Keep St"}]},
        format="json",
    )

    assert response.status_code == 400
    keep.refresh_from_db()
    drop.refresh_from_db()
    assert keep.is_active is True
    assert drop.is_active is True


@pytest.mark.django_db
def test_upsert_import_returns_per_row_notices() -> None:
    response = APIClient().post(
        "/api/sites/import/",
        {
            "mode": "upsert",
            "sites": [
                {"name": "Good", "address": "1 Good St"},
                {"name": "", "address": "bad"},
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["created_count"] == 1
    assert body["rejected_count"] == 1
    assert any(notice["kind"] == "rejected" for notice in body["notices"])


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    [
        {"mode": "bogus", "sites": []},
        {"mode": "upsert", "sites": "not-a-list"},
        {"sites": [{"name": "A", "address": "1 A St"}]},
        [{"name": "A", "address": "1 A St"}],
    ],
)
def test_import_rejects_malformed_requests(payload: object) -> None:
    response = APIClient().post("/api/sites/import/", payload, format="json")
    assert response.status_code == 400


# --- POST /api/sites/deactivate/ ---------------------------------------------


@pytest.mark.django_db
def test_deactivate_soft_deactivates_the_selected_active_sites() -> None:
    first = Site.objects.create(name="A", address="1 A St")
    second = Site.objects.create(name="B", address="2 B St")

    response = APIClient().post(
        "/api/sites/deactivate/",
        {"ids": [first.id, second.id]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["deactivated_count"] == 2
    first.refresh_from_db()
    second.refresh_from_db()
    assert first.is_active is False
    assert second.is_active is False


@pytest.mark.django_db
def test_deactivate_ignores_unknown_and_already_inactive_ids() -> None:
    active = Site.objects.create(name="A", address="1 A St")
    inactive = Site.objects.create(name="B", address="2 B St", is_active=False)

    response = APIClient().post(
        "/api/sites/deactivate/",
        {"ids": [active.id, inactive.id, 999_999]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["deactivated_count"] == 1
    active.refresh_from_db()
    assert active.is_active is False


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    [
        {"ids": "not-a-list"},
        {"ids": [1, "two"]},
        {"ids": [True]},
        {},
    ],
)
def test_deactivate_rejects_bad_payloads(payload: object) -> None:
    response = APIClient().post("/api/sites/deactivate/", payload, format="json")
    assert response.status_code == 400
