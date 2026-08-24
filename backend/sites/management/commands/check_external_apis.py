from collections.abc import Callable
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from sites.services.geocoding import NominatimStatusCheckError, check_nominatim_status
from sites.services.pvwatts import PVWattsCheckError, check_pvwatts_connection
from sites.services.solar_resource import (
    SolarResourceCheckError,
    check_solar_resource_connection,
)

type CheckFunction = Callable[[], object]


class Command(BaseCommand):
    help = "Check live provider connectivity without reading or writing Sites."

    def handle(self, *args: Any, **options: Any) -> None:
        self._validate_configuration()
        self._run_check(
            "Nominatim",
            check_nominatim_status,
            (NominatimStatusCheckError,),
            "healthy",
        )
        self._run_check(
            "Solar Resource",
            check_solar_resource_connection,
            (SolarResourceCheckError,),
            "response contract valid",
        )
        self._run_check(
            "PVWatts",
            check_pvwatts_connection,
            (PVWattsCheckError,),
            "response contract valid",
        )

    def _run_check(
        self,
        label: str,
        check: CheckFunction,
        expected_errors: tuple[type[Exception], ...],
        success_message: str,
    ) -> None:
        try:
            check()
        except expected_errors as error:
            raise CommandError(str(error)) from None
        # This command is the terminal secrecy boundary. Provider services catch
        # their expected failures; an unexpected error must still exit nonzero
        # without printing raw exception details.
        except Exception:
            raise CommandError(
                f"{label} connectivity check failed unexpectedly"
            ) from None
        self.stdout.write(self.style.SUCCESS(f"{label}: {success_message}"))

    @staticmethod
    def _validate_configuration() -> None:
        required_settings = (
            "CONTACT_EMAIL",
            "NLR_API_KEY",
            "NLR_API_BASE",
            "NOMINATIM_BASE_URL",
        )
        for setting_name in required_settings:
            value = getattr(settings, setting_name, "")
            if not isinstance(value, str) or not value.strip():
                raise CommandError(f"{setting_name} must be configured")

        if settings.CONTACT_EMAIL.strip() == "you@example.com":
            raise CommandError("CONTACT_EMAIL must be configured")
        if settings.NLR_API_KEY.strip().startswith("get-a-free-key-at-"):
            raise CommandError("NLR_API_KEY must be configured")
