import pytest
from pytest_django.fixtures import Settings

from sites.services import geocoding
from sites.services.geocoding import NominatimGateway


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--run-live",
        action="store_true",
        default=False,
        help="run opt-in tests that contact live provider endpoints",
    )


def pytest_collection_modifyitems(
    config: pytest.Config,
    items: list[pytest.Item],
) -> None:
    if bool(config.getoption("--run-live")):
        return

    live_disabled = pytest.mark.skip(
        reason="live provider tests require the explicit --run-live option"
    )
    for item in items:
        if "live" in item.keywords:
            item.add_marker(live_disabled)


@pytest.fixture(autouse=True)
def missing_nlr_api_key(
    settings: Settings,
    request: pytest.FixtureRequest,
) -> None:
    if request.node.get_closest_marker("live") is None:
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
