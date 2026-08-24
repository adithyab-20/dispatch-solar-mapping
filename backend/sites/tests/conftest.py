import pytest
from pytest_django.fixtures import Settings

from sites.services import geocoding
from sites.services.geocoding import NominatimGateway


@pytest.fixture(autouse=True)
def missing_nlr_api_key(settings: Settings) -> None:
    settings.NLR_API_KEY = ""


@pytest.fixture
def isolated_nominatim_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> NominatimGateway:
    current_time = [0.0]

    def sleep(seconds: float) -> None:
        current_time[0] += seconds

    gateway = NominatimGateway(
        geocoding.NOMINATIM_GATEWAY.session,
        monotonic=lambda: current_time[0],
        sleep=sleep,
    )
    monkeypatch.setattr(geocoding, "NOMINATIM_GATEWAY", gateway)
    return gateway
