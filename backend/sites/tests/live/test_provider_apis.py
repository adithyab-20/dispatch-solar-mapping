import pytest
from django.conf import settings

from sites.services.geocoding import check_nominatim_status
from sites.services.pvwatts import check_pvwatts_connection
from sites.services.solar_resource import check_solar_resource_connection

pytestmark = [pytest.mark.live, pytest.mark.enable_socket]


def require_live_setting(name: str) -> str:
    value = getattr(settings, name, "")
    if not isinstance(value, str) or not value.strip():
        pytest.fail(f"{name} must be configured before live provider tests can run")
    configured_value = value.strip()
    if name == "CONTACT_EMAIL" and (
        "@" not in configured_value or configured_value == "you@example.com"
    ):
        pytest.fail("CONTACT_EMAIL must identify a real contact before live tests run")
    if name == "NLR_API_KEY" and configured_value.startswith("get-a-free-key-at-"):
        pytest.fail("NLR_API_KEY must be replaced before live provider tests can run")
    return configured_value


@pytest.fixture(scope="module", autouse=True)
def require_complete_live_configuration() -> None:
    require_live_setting("CONTACT_EMAIL")
    require_live_setting("NLR_API_KEY")
    require_live_setting("NLR_API_BASE")
    require_live_setting("NOMINATIM_BASE_URL")


def test_live_nominatim_status_is_healthy_without_searching() -> None:

    status = check_nominatim_status()

    assert status.status == 0


def test_live_solar_resource_response_matches_the_production_contract() -> None:
    result = check_solar_resource_connection()

    assert len(result.monthly_solar_data) == 12


def test_live_pvwatts_response_matches_the_production_contract() -> None:
    result = check_pvwatts_connection()

    assert len(result.monthly_pvwatts_data) == 12
