from typing import Any

from django.core.exceptions import ValidationError
from django.db import models

from sites.services.normalization import normalize_text


class GeocodeStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    RESOLVED = "resolved", "Resolved"
    UNRESOLVED = "unresolved", "Unresolved"
    FAILED = "failed", "Failed"


class ProcessingStatus(models.TextChoices):
    BLOCKED = "blocked", "Blocked"
    PENDING = "pending", "Pending"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"


def _processing_attempt_matches_status(
    status_field: str, attempted_at_field: str
) -> models.Q:
    unhandled = {
        f"{status_field}__in": (
            ProcessingStatus.BLOCKED,
            ProcessingStatus.PENDING,
        ),
        f"{attempted_at_field}__isnull": True,
    }
    handled = {
        f"{status_field}__in": (
            ProcessingStatus.SUCCEEDED,
            ProcessingStatus.FAILED,
        ),
        f"{attempted_at_field}__isnull": False,
    }
    return models.Q(**unhandled) | models.Q(**handled)


class Site(models.Model):
    name = models.TextField()
    normalized_name = models.TextField(editable=False)
    address = models.TextField()
    normalized_address = models.TextField(editable=False)
    is_active = models.BooleanField(default=True)

    geocode_status = models.CharField(
        max_length=10,
        choices=GeocodeStatus,
        default=GeocodeStatus.PENDING,
    )
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    resolved_address = models.TextField(null=True, blank=True)
    geocode_error = models.TextField(null=True, blank=True)
    geocode_attempted_at = models.DateTimeField(null=True, blank=True)

    solar_resource_status = models.CharField(
        max_length=9,
        choices=ProcessingStatus,
        default=ProcessingStatus.BLOCKED,
    )
    annual_ghi_kwh_m2_day = models.FloatField(null=True, blank=True)
    annual_dni_kwh_m2_day = models.FloatField(null=True, blank=True)
    annual_latitude_tilt_kwh_m2_day = models.FloatField(null=True, blank=True)
    monthly_solar_data = models.JSONField(null=True, blank=True)
    solar_resource_error = models.TextField(null=True, blank=True)
    solar_resource_attempted_at = models.DateTimeField(null=True, blank=True)

    pvwatts_status = models.CharField(
        max_length=9,
        choices=ProcessingStatus,
        default=ProcessingStatus.BLOCKED,
    )
    pvwatts_assumptions = models.JSONField(null=True, blank=True)
    annual_ac_kwh = models.FloatField(null=True, blank=True)
    capacity_factor_percent = models.FloatField(null=True, blank=True)
    annual_solar_radiation_kwh_m2_day = models.FloatField(null=True, blank=True)
    monthly_pvwatts_data = models.JSONField(null=True, blank=True)
    pvwatts_error = models.TextField(null=True, blank=True)
    pvwatts_attempted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("id",)
        constraints = [
            models.UniqueConstraint(
                fields=("normalized_name", "normalized_address"),
                name="unique_site_normalized_identity",
            ),
            models.CheckConstraint(
                condition=models.Q(geocode_status__in=GeocodeStatus.values),
                name="site_geocode_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(solar_resource_status__in=ProcessingStatus.values),
                name="site_solar_resource_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(pvwatts_status__in=ProcessingStatus.values),
                name="site_pvwatts_status_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        geocode_status=GeocodeStatus.PENDING,
                        geocode_attempted_at__isnull=True,
                    )
                    | models.Q(
                        geocode_status__in=(
                            GeocodeStatus.RESOLVED,
                            GeocodeStatus.UNRESOLVED,
                            GeocodeStatus.FAILED,
                        ),
                        geocode_attempted_at__isnull=False,
                    )
                ),
                name="site_geocode_attempt_matches_status",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(geocode_status=GeocodeStatus.RESOLVED)
                    | models.Q(
                        solar_resource_status=ProcessingStatus.BLOCKED,
                        pvwatts_status=ProcessingStatus.BLOCKED,
                    )
                ),
                name="site_downstream_blocked_until_geocoded",
            ),
            models.CheckConstraint(
                condition=_processing_attempt_matches_status(
                    "solar_resource_status", "solar_resource_attempted_at"
                ),
                name="site_solar_attempt_matches_status",
            ),
            models.CheckConstraint(
                condition=_processing_attempt_matches_status(
                    "pvwatts_status", "pvwatts_attempted_at"
                ),
                name="site_pvwatts_attempt_matches_status",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        geocode_status=GeocodeStatus.RESOLVED,
                        latitude__isnull=False,
                        longitude__isnull=False,
                    )
                    | (
                        ~models.Q(geocode_status=GeocodeStatus.RESOLVED)
                        & models.Q(latitude__isnull=True, longitude__isnull=True)
                    )
                ),
                name="site_coordinates_match_geocode_status",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(latitude__isnull=True)
                    | models.Q(latitude__gte=-90.0, latitude__lte=90.0)
                ),
                name="site_latitude_in_range",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(longitude__isnull=True)
                    | models.Q(longitude__gte=-180.0, longitude__lte=180.0)
                ),
                name="site_longitude_in_range",
            ),
        ]

    def save(self, *args: Any, **kwargs: Any) -> None:
        normalized_name = normalize_text(self.name)
        normalized_address = normalize_text(self.address)

        errors: dict[str, str] = {}
        if not normalized_name:
            errors["name"] = "Must contain at least one non-punctuation character."
        if not normalized_address:
            errors["address"] = "Must contain at least one non-punctuation character."
        if errors:
            raise ValidationError(errors)

        self.normalized_name = normalized_name
        self.normalized_address = normalized_address

        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            expanded_update_fields = set(update_fields)
            if "name" in expanded_update_fields:
                expanded_update_fields.add("normalized_name")
            if "address" in expanded_update_fields:
                expanded_update_fields.add("normalized_address")
            kwargs["update_fields"] = expanded_update_fields

        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name
