from sites.models import Site
from sites.services.geocoding import GeocodingOutcome, geocode_site


def process_new_sites(site_ids: tuple[int, ...]) -> None:
    outcomes_by_address: dict[str, GeocodingOutcome] = {}
    for site_id in site_ids:
        site = Site.objects.get(pk=site_id)
        outcome = geocode_site(
            site,
            cached_outcome=outcomes_by_address.get(site.address),
        )
        outcomes_by_address[site.address] = outcome
