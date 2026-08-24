from datetime import datetime, timezone

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from sites.models import GeocodeStatus, Site


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("action", "initial_state", "expected_state"),
    [
        ("deactivate_sites", True, False),
        ("reactivate_sites", False, True),
    ],
)
def test_admin_bulk_lifecycle_actions_preserve_provider_state(
    action: str, initial_state: bool, expected_state: bool
) -> None:
    user = get_user_model().objects.create_superuser(
        username="operator", password="password", email="operator@example.com"
    )
    site = Site.objects.create(
        name="Lifecycle Site",
        address="1 Main St",
        is_active=initial_state,
        geocode_status=GeocodeStatus.FAILED,
        geocode_error="Stored provider failure",
        geocode_attempted_at=datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc),
    )
    before = Site.objects.values().get(pk=site.pk)
    client = Client()
    client.force_login(user)

    response = client.post(
        "/admin/sites/site/",
        {"action": action, "_selected_action": [site.pk], "index": 0},
        follow=True,
    )

    assert response.status_code == 200
    after = Site.objects.values().get(pk=site.pk)
    assert after == {
        **before,
        "is_active": expected_state,
        "updated_at": after["updated_at"],
    }


@pytest.mark.django_db
def test_admin_offers_hard_deletion_for_full_control() -> None:
    user = get_user_model().objects.create_superuser(
        username="operator", password="password", email="operator@example.com"
    )
    site = Site.objects.create(name="Doomed Site", address="1 Archive Way")
    client = Client()
    client.force_login(user)

    changelist = client.get("/admin/sites/site/")
    action_names = [
        name for name, _ in changelist.context["action_form"].fields["action"].choices
    ]
    delete = client.post(
        f"/admin/sites/site/{site.pk}/delete/", {"post": "yes"}, follow=True
    )

    assert changelist.status_code == 200
    assert "delete_selected" in action_names
    assert delete.status_code == 200
    assert not Site.objects.filter(pk=site.pk).exists()
