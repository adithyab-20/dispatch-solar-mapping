from pathlib import Path

from django.conf import settings

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def test_backend_environment_example_documents_every_provider_boundary() -> None:
    example = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")

    assert {
        line.partition("=")[0]
        for line in example.splitlines()
        if line and not line.startswith("#")
    } == {
        "NLR_API_KEY",
        "NLR_API_BASE",
        "CONTACT_EMAIL",
        "NOMINATIM_BASE_URL",
    }
    assert "you@example.com" in example


def test_nominatim_configuration_and_traffic_stay_in_the_shared_gateway() -> None:
    backend_root = PROJECT_ROOT / "backend"
    allowed_paths = {
        backend_root / "config" / "settings.py",
        backend_root / "sites" / "services" / "geocoding.py",
    }
    production_paths = [
        path
        for path in backend_root.rglob("*.py")
        if "tests" not in path.parts and "migrations" not in path.parts
    ]

    offenders = [
        path.relative_to(PROJECT_ROOT)
        for path in production_paths
        if path not in allowed_paths
        and "nominatim" in path.read_text(encoding="utf-8").casefold()
    ]

    assert offenders == []


def test_cors_is_local_only_and_never_credentialed() -> None:
    assert set(settings.CORS_ALLOWED_ORIGINS) == {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
    assert settings.CORS_ALLOW_ALL_ORIGINS is False
    assert settings.CORS_ALLOW_CREDENTIALS is False
