from io import StringIO
from unittest.mock import Mock

import pytest
from django.core.management import CommandError, call_command
from pytest_django.fixtures import Settings

from sites.management.commands import check_external_apis
from sites.services.geocoding import NominatimStatusCheckError


@pytest.fixture(autouse=True)
def complete_provider_configuration(settings: Settings) -> None:
    settings.CONTACT_EMAIL = "operator@example.com"
    settings.NLR_API_KEY = "test-api-key"
    settings.NLR_API_BASE = "https://developer.example.test"
    settings.NOMINATIM_BASE_URL = "https://nominatim.example.test"


def test_command_checks_all_providers_without_database_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stdout = StringIO()
    nominatim_check = Mock()
    solar_check = Mock()
    pvwatts_check = Mock()
    monkeypatch.setattr(check_external_apis, "check_nominatim_status", nominatim_check)
    monkeypatch.setattr(
        check_external_apis,
        "check_solar_resource_connection",
        solar_check,
    )
    monkeypatch.setattr(check_external_apis, "check_pvwatts_connection", pvwatts_check)

    call_command("check_external_apis", stdout=stdout)

    nominatim_check.assert_called_once_with()
    solar_check.assert_called_once_with()
    pvwatts_check.assert_called_once_with()
    assert stdout.getvalue().splitlines() == [
        "Nominatim: healthy",
        "Solar Resource: response contract valid",
        "PVWatts: response contract valid",
    ]


@pytest.mark.parametrize(
    ("setting_name", "setting_value"),
    [
        ("CONTACT_EMAIL", "you@example.com"),
        ("NLR_API_KEY", "get-a-free-key-at-developer.nlr.gov"),
        ("NLR_API_BASE", ""),
        ("NOMINATIM_BASE_URL", ""),
    ],
)
def test_command_rejects_missing_or_placeholder_configuration(
    setting_name: str,
    setting_value: str,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    setattr(settings, setting_name, setting_value)
    nominatim_check = Mock()
    monkeypatch.setattr(check_external_apis, "check_nominatim_status", nominatim_check)

    with pytest.raises(CommandError, match=f"{setting_name} must be configured"):
        call_command("check_external_apis")

    nominatim_check.assert_not_called()


def test_command_prints_only_safe_check_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        check_external_apis,
        "check_nominatim_status",
        Mock(side_effect=NominatimStatusCheckError("Nominatim status is unavailable")),
    )

    with pytest.raises(
        CommandError, match="Nominatim status is unavailable"
    ) as exc_info:
        call_command("check_external_apis")

    assert "http" not in str(exc_info.value).casefold()
    assert "secret" not in str(exc_info.value).casefold()


def test_command_masks_unexpected_exception_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        check_external_apis,
        "check_nominatim_status",
        Mock(side_effect=RuntimeError("secret raw provider exception")),
    )

    with pytest.raises(
        CommandError,
        match="Nominatim connectivity check failed unexpectedly",
    ) as exc_info:
        call_command("check_external_apis")

    assert "secret" not in str(exc_info.value).casefold()
