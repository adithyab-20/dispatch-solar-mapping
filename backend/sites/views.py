from collections.abc import Callable

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.request import Request
from rest_framework.response import Response

from sites.models import Site
from sites.serializers import SiteDetailSerializer, SiteListSerializer
from sites.services.importing import SyncResult, UpsertResult
from sites.services.normalization import normalize_text
from sites.services.pvwatts import run_pvwatts
from sites.services.solar_resource import fetch_solar_resource
from sites.services.workflow import (
    apply_import,
    invalidate_location,
    process_site,
    refresh_geocoding,
    refresh_processing_stage,
)

ACTIVE_SITE_QUERYSET = Site.objects.filter(is_active=True)


class SiteListView(generics.ListAPIView[Site]):
    queryset = ACTIVE_SITE_QUERYSET
    serializer_class = SiteListSerializer
    http_method_names = ["get", "head", "options"]


class SiteDetailView(generics.RetrieveUpdateAPIView[Site]):
    queryset = ACTIVE_SITE_QUERYSET
    serializer_class = SiteDetailSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def patch(self, request: Request, *args: object, **kwargs: object) -> Response:
        site = self.get_object()
        edits, errors = _validate_patch_payload(request.data)
        if errors:
            return Response(
                {
                    "detail": "The PATCH payload is invalid.",
                    "errors": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        assert edits is not None

        if all(getattr(site, field) == value for field, value in edits.items()):
            return Response(SiteDetailSerializer(site).data)

        name = edits.get("name", site.name)
        address = edits.get("address", site.address)
        normalized_name = normalize_text(name)
        normalized_address = normalize_text(address)
        conflict = _find_identity_conflict(
            site,
            normalized_name=normalized_name,
            normalized_address=normalized_address,
        )
        if conflict is not None:
            return _conflict_response(conflict)

        address_changed = normalized_address != site.normalized_address
        for field, value in edits.items():
            setattr(site, field, value)

        try:
            with transaction.atomic():
                if address_changed:
                    invalidate_location(site, additional_fields=edits.keys())
                else:
                    site.save(update_fields=(*edits.keys(), "updated_at"))
        except IntegrityError:
            conflict = _find_identity_conflict(
                site,
                normalized_name=normalized_name,
                normalized_address=normalized_address,
            )
            if conflict is None:
                raise
            return _conflict_response(conflict)

        if address_changed:
            process_site(site)
        return Response(SiteDetailSerializer(site).data)


class ActiveSiteActionView(generics.GenericAPIView[Site]):
    queryset = ACTIVE_SITE_QUERYSET
    serializer_class = SiteDetailSerializer
    http_method_names = ["post", "options"]

    @staticmethod
    def detail_response(site: Site) -> Response:
        return Response(SiteDetailSerializer(site).data)


class GeocodeRefreshView(ActiveSiteActionView):
    def post(self, request: Request, *args: object, **kwargs: object) -> Response:
        site = self.get_object()
        refresh_geocoding(site)
        return self.detail_response(site)


class ProcessingStageRefreshView(ActiveSiteActionView):
    provider: Callable[[Site], None]
    stage_label: str

    def post(self, request: Request, *args: object, **kwargs: object) -> Response:
        site = self.get_object()
        if not refresh_processing_stage(site, self.provider):
            return Response(
                {
                    "detail": (
                        f"{self.stage_label} requires resolved geocoding with "
                        "both coordinates present."
                    ),
                    "geocode_status": site.geocode_status,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return self.detail_response(site)


class SolarResourceRefreshView(ProcessingStageRefreshView):
    provider = staticmethod(fetch_solar_resource)
    stage_label = "Solar Resource"


class PVWattsRefreshView(ProcessingStageRefreshView):
    provider = staticmethod(run_pvwatts)
    stage_label = "PVWatts"


class SiteImportView(generics.GenericAPIView[Site]):
    """Browser front door for the same import path as the management command."""

    queryset = ACTIVE_SITE_QUERYSET
    serializer_class = SiteListSerializer
    http_method_names = ["post", "options"]

    def post(self, request: Request, *args: object, **kwargs: object) -> Response:
        payload = request.data
        if not isinstance(payload, dict):
            return _bad_request("The request body must be a JSON object.")
        # Sync is deliberately terminal-only (the import_sites --sync command),
        # so the browser can never deactivate sites omitted from an upload.
        mode = payload.get("mode")
        if mode != "upsert":
            return _bad_request('mode must be "upsert".')
        rows = payload.get("sites")
        if not isinstance(rows, list):
            return _bad_request("sites must be a JSON array.")

        result = apply_import(rows, mode)
        return Response(_import_response(result))


class SiteDeactivateView(generics.GenericAPIView[Site]):
    """Soft-deactivate a selection of active sites; never touches providers."""

    queryset = ACTIVE_SITE_QUERYSET
    serializer_class = SiteListSerializer
    http_method_names = ["post", "options"]

    def post(self, request: Request, *args: object, **kwargs: object) -> Response:
        payload = request.data
        if not isinstance(payload, dict):
            return _bad_request("The request body must be a JSON object.")
        ids = payload.get("ids")
        if not isinstance(ids, list) or not all(
            isinstance(value, int) and not isinstance(value, bool) for value in ids
        ):
            return _bad_request("ids must be a JSON array of integers.")

        deactivated_count = Site.objects.filter(is_active=True, pk__in=ids).update(
            is_active=False, updated_at=timezone.now()
        )
        return Response({"deactivated_count": deactivated_count})


def _bad_request(detail: str) -> Response:
    return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)


def _import_response(result: SyncResult | UpsertResult) -> dict[str, object]:
    data: dict[str, object] = {
        "summary": result.summary,
        "created_count": result.created_count,
        "reactivated_count": result.reactivated_count,
        "unchanged_count": result.unchanged_count,
        "duplicate_count": result.duplicate_count,
        "notices": [
            {"kind": notice.kind, "message": notice.message}
            for notice in result.notices
        ],
    }
    if isinstance(result, SyncResult):
        data["deactivated_count"] = result.deactivated_count
    else:
        data["rejected_count"] = result.rejected_count
    return data


def _validate_patch_payload(
    payload: object,
) -> tuple[dict[str, str] | None, dict[str, list[str]]]:
    errors: dict[str, list[str]] = {}
    if not isinstance(payload, dict):
        errors["non_field_errors"] = ["Expected a JSON object."]
        return None, errors

    unsupported_fields = sorted(
        str(field) for field in payload if field not in {"name", "address"}
    )
    if unsupported_fields:
        errors["unsupported_fields"] = unsupported_fields

    edits: dict[str, str] = {}
    for field in ("name", "address"):
        if field not in payload:
            continue
        value = payload[field]
        if not isinstance(value, str) or not normalize_text(value):
            errors[field] = ["Must be a non-empty string."]
        else:
            edits[field] = value

    if not any(field in payload for field in ("name", "address")):
        errors["non_field_errors"] = ["At least one of name or address is required."]
    return edits, errors


def _find_identity_conflict(
    site: Site, *, normalized_name: str, normalized_address: str
) -> Site | None:
    return (
        Site.objects.filter(
            normalized_name=normalized_name,
            normalized_address=normalized_address,
        )
        .exclude(pk=site.pk)
        .first()
    )


def _conflict_response(conflict: Site) -> Response:
    if conflict.is_active:
        detail = "An active site with that name and address pair already exists."
    else:
        detail = (
            "An inactive site with that name and address pair already exists. "
            "Reactivate it through Django Admin or the import lifecycle."
        )
    return Response(
        {
            "detail": detail,
            "conflict_site_id": conflict.pk,
            "conflict_is_active": conflict.is_active,
        },
        status=status.HTTP_409_CONFLICT,
    )
