from collections.abc import Callable, Iterable

from sites.models import GeocodeStatus, ProcessingStatus, Site
from sites.services.geocoding import GeocodingOutcome, geocode_site
from sites.services.pvwatts import run_pvwatts
from sites.services.solar_resource import fetch_solar_resource

LOCATION_FIELDS = (
    "geocode_status",
    "latitude",
    "longitude",
    "resolved_address",
    "geocode_error",
    "geocode_attempted_at",
)
SOLAR_RESOURCE_FIELDS = (
    "solar_resource_status",
    "annual_ghi_kwh_m2_day",
    "annual_dni_kwh_m2_day",
    "annual_latitude_tilt_kwh_m2_day",
    "monthly_solar_data",
    "solar_resource_error",
    "solar_resource_attempted_at",
)
PVWATTS_FIELDS = (
    "pvwatts_status",
    "pvwatts_assumptions",
    "annual_ac_kwh",
    "capacity_factor_percent",
    "annual_solar_radiation_kwh_m2_day",
    "monthly_pvwatts_data",
    "pvwatts_error",
    "pvwatts_attempted_at",
)


def invalidate_location(site: Site, *, additional_fields: Iterable[str] = ()) -> None:
    """Commit the consistency-first empty state used by edits and refreshes."""

    site.geocode_status = GeocodeStatus.PENDING
    site.latitude = None
    site.longitude = None
    site.resolved_address = None
    site.geocode_error = None
    site.geocode_attempted_at = None

    site.solar_resource_status = ProcessingStatus.BLOCKED
    site.annual_ghi_kwh_m2_day = None
    site.annual_dni_kwh_m2_day = None
    site.annual_latitude_tilt_kwh_m2_day = None
    site.monthly_solar_data = None
    site.solar_resource_error = None
    site.solar_resource_attempted_at = None

    site.pvwatts_status = ProcessingStatus.BLOCKED
    site.pvwatts_assumptions = None
    site.annual_ac_kwh = None
    site.capacity_factor_percent = None
    site.annual_solar_radiation_kwh_m2_day = None
    site.monthly_pvwatts_data = None
    site.pvwatts_error = None
    site.pvwatts_attempted_at = None

    site.save(
        update_fields=(
            *additional_fields,
            *LOCATION_FIELDS,
            *SOLAR_RESOURCE_FIELDS,
            *PVWATTS_FIELDS,
            "updated_at",
        )
    )


def process_site(
    site: Site, *, cached_geocoding_outcome: GeocodingOutcome | None = None
) -> GeocodingOutcome:
    outcome = geocode_site(site, cached_outcome=cached_geocoding_outcome)
    if outcome.status == GeocodeStatus.RESOLVED:
        fetch_solar_resource(site)
        run_pvwatts(site)
    return outcome


def refresh_geocoding(site: Site) -> None:
    invalidate_location(site)
    process_site(site)


def refresh_processing_stage(site: Site, provider: Callable[[Site], None]) -> bool:
    """Run one downstream stage without disturbing its sibling stage."""

    if (
        site.geocode_status != GeocodeStatus.RESOLVED
        or site.latitude is None
        or site.longitude is None
    ):
        return False
    provider(site)
    return True


def process_new_sites(site_ids: tuple[int, ...]) -> None:
    outcomes_by_address: dict[str, GeocodingOutcome] = {}
    for site_id in site_ids:
        site = Site.objects.get(pk=site_id)
        outcome = process_site(
            site,
            cached_geocoding_outcome=outcomes_by_address.get(site.address),
        )
        outcomes_by_address[site.address] = outcome
