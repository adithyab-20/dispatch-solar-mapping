from sites.models import GeocodeStatus, Site
from sites.services.geocoding import GeocodingOutcome, geocode_site
from sites.services.solar_resource import fetch_solar_resource


def process_new_sites(site_ids: tuple[int, ...]) -> None:
    outcomes_by_address: dict[str, GeocodingOutcome] = {}
    for site_id in site_ids:
        site = Site.objects.get(pk=site_id)
        outcome = geocode_site(
            site,
            cached_outcome=outcomes_by_address.get(site.address),
        )
        outcomes_by_address[site.address] = outcome
        if outcome.status == GeocodeStatus.RESOLVED:
            fetch_solar_resource(site)
