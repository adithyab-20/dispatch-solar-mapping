from typing import TYPE_CHECKING

from django.contrib import admin
from django.db.models import QuerySet
from django.http import HttpRequest
from django.utils import timezone

from sites.models import Site

if TYPE_CHECKING:
    SiteModelAdmin = admin.ModelAdmin[Site]
else:
    SiteModelAdmin = admin.ModelAdmin


@admin.register(Site)
class SiteAdmin(SiteModelAdmin):
    list_display = ("name", "address", "is_active", "geocode_status", "updated_at")
    list_filter = ("is_active", "geocode_status")
    search_fields = ("name", "address")
    # Hard delete is intentionally available here (and only here) so operators
    # keep full control; the soft-delete actions below stay the default,
    # reversible path that preserves stored provider state.
    actions = ("deactivate_sites", "reactivate_sites")

    @admin.action(description="Deactivate selected sites")
    def deactivate_sites(self, request: HttpRequest, queryset: QuerySet[Site]) -> None:
        changed = queryset.filter(is_active=True).update(
            is_active=False, updated_at=timezone.now()
        )
        self.message_user(request, f"Deactivated {changed} site(s).")

    @admin.action(description="Reactivate selected sites")
    def reactivate_sites(self, request: HttpRequest, queryset: QuerySet[Site]) -> None:
        changed = queryset.filter(is_active=False).update(
            is_active=True, updated_at=timezone.now()
        )
        self.message_user(request, f"Reactivated {changed} site(s).")
