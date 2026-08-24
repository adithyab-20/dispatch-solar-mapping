from collections import defaultdict
from dataclasses import dataclass
from enum import StrEnum

from django.db import transaction

from sites.models import Site
from sites.services.normalization import normalize_text


class ImportNoticeKind(StrEnum):
    REJECTED = "rejected"
    WARNING = "warning"


@dataclass(frozen=True)
class ImportNotice:
    kind: ImportNoticeKind
    message: str


@dataclass(frozen=True)
class UpsertResult:
    created_count: int
    reactivated_count: int
    unchanged_count: int
    duplicate_count: int
    rejected_count: int
    created_site_ids: tuple[int, ...]
    notices: tuple[ImportNotice, ...]

    @property
    def summary(self) -> str:
        return (
            f"Import complete: {self.created_count} created, "
            f"{self.reactivated_count} reactivated, "
            f"{self.unchanged_count} unchanged, "
            f"{self.duplicate_count} duplicate rows skipped, "
            f"{self.rejected_count} rejected."
        )


@dataclass(frozen=True)
class SyncResult:
    created_count: int
    reactivated_count: int
    unchanged_count: int
    deactivated_count: int
    duplicate_count: int
    created_site_ids: tuple[int, ...]
    notices: tuple[ImportNotice, ...]

    @property
    def summary(self) -> str:
        return (
            f"Sync complete: {self.created_count} created, "
            f"{self.reactivated_count} reactivated, "
            f"{self.unchanged_count} unchanged, "
            f"{self.deactivated_count} deactivated, "
            f"{self.duplicate_count} duplicate rows skipped."
        )


@dataclass(frozen=True)
class _ValidRow:
    name: str
    address: str
    normalized_name: str
    normalized_address: str


def _validate_row(row: object) -> tuple[_ValidRow | None, list[str]]:
    if not isinstance(row, dict):
        return None, ["row must be an object"]

    errors: list[str] = []
    values: dict[str, str] = {}
    normalized_values: dict[str, str] = {}
    for field in ("name", "address"):
        if field not in row:
            errors.append(f"{field} is required")
            continue

        value = row[field]
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{field} must be a non-empty string")
            continue

        normalized_value = normalize_text(value)
        if not normalized_value:
            errors.append(f"{field} must normalize to a non-empty value")
            continue

        values[field] = value
        normalized_values[field] = normalized_value

    if errors:
        return None, errors

    return (
        _ValidRow(
            name=values["name"],
            address=values["address"],
            normalized_name=normalized_values["name"],
            normalized_address=normalized_values["address"],
        ),
        [],
    )


def _ambiguity_notice(
    row_number: int,
    *,
    subject: str,
    relationship: str,
    site_ids: list[int],
) -> ImportNotice | None:
    if not site_ids:
        return None

    joined_ids = ", ".join(str(site_id) for site_id in site_ids)
    return ImportNotice(
        kind=ImportNoticeKind.WARNING,
        message=(
            f"Row {row_number} warning: normalized {subject} is already used "
            f"{relationship} (site IDs: {joined_ids}); records will remain separate."
        ),
    )


def _index_active(
    by_name: dict[str, list[Site]],
    by_address: dict[str, list[Site]],
    site: Site,
) -> None:
    """Add a now-active site to the ambiguity indexes for later rows to see."""
    by_name[site.normalized_name].append(site)
    by_address[site.normalized_address].append(site)


def _creation_ambiguity_notices(
    row_number: int,
    valid_row: _ValidRow,
    active_by_name: dict[str, list[Site]],
    active_by_address: dict[str, list[Site]],
) -> list[ImportNotice]:
    """Warn only when a newly created record partially matches an active one."""
    notices: list[ImportNotice] = []
    address_notice = _ambiguity_notice(
        row_number,
        subject="address",
        relationship="under a different normalized name",
        site_ids=[
            site.id
            for site in active_by_address[valid_row.normalized_address]
            if site.normalized_name != valid_row.normalized_name
        ],
    )
    if address_notice is not None:
        notices.append(address_notice)

    name_notice = _ambiguity_notice(
        row_number,
        subject="name",
        relationship="with a different normalized address",
        site_ids=[
            site.id
            for site in active_by_name[valid_row.normalized_name]
            if site.normalized_address != valid_row.normalized_address
        ],
    )
    if name_notice is not None:
        notices.append(name_notice)
    return notices


def upsert_sites(rows: list[object]) -> UpsertResult:
    """Add or reactivate valid site rows without changing unmatched records."""
    existing_sites = list(Site.objects.all())
    sites_by_pair = {
        (site.normalized_name, site.normalized_address): site for site in existing_sites
    }
    # Ambiguity is only meaningful against the live catalogue, and only worth
    # raising when a row adds a genuinely new record; matched rows changed
    # nothing, and deactivated records are not part of the active list.
    active_by_name: dict[str, list[Site]] = defaultdict(list)
    active_by_address: dict[str, list[Site]] = defaultdict(list)
    for site in existing_sites:
        if site.is_active:
            active_by_name[site.normalized_name].append(site)
            active_by_address[site.normalized_address].append(site)

    created_count = 0
    reactivated_count = 0
    unchanged_count = 0
    duplicate_count = 0
    rejected_count = 0
    notices: list[ImportNotice] = []
    created_site_ids: list[int] = []
    seen_pairs: set[tuple[str, str]] = set()

    for row_number, row in enumerate(rows, start=1):
        valid_row, errors = _validate_row(row)
        if valid_row is None:
            rejected_count += 1
            notices.append(
                ImportNotice(
                    kind=ImportNoticeKind.REJECTED,
                    message=f"Row {row_number} rejected: {'; '.join(errors)}.",
                )
            )
            continue

        normalized_pair = (
            valid_row.normalized_name,
            valid_row.normalized_address,
        )
        if normalized_pair in seen_pairs:
            duplicate_count += 1
            notices.append(
                ImportNotice(
                    kind=ImportNoticeKind.WARNING,
                    message=(
                        f"Row {row_number} skipped: duplicate normalized "
                        "name/address pair."
                    ),
                )
            )
            continue
        seen_pairs.add(normalized_pair)

        existing_site = sites_by_pair.get(normalized_pair)
        if existing_site is not None:
            if not existing_site.is_active:
                existing_site.is_active = True
                existing_site.save(update_fields=("is_active", "updated_at"))
                reactivated_count += 1
                _index_active(active_by_name, active_by_address, existing_site)
            else:
                unchanged_count += 1
            continue

        notices.extend(
            _creation_ambiguity_notices(
                row_number, valid_row, active_by_name, active_by_address
            )
        )

        created_site = Site.objects.create(
            name=valid_row.name,
            address=valid_row.address,
        )
        sites_by_pair[normalized_pair] = created_site
        _index_active(active_by_name, active_by_address, created_site)
        created_count += 1
        created_site_ids.append(created_site.id)

    return UpsertResult(
        created_count=created_count,
        reactivated_count=reactivated_count,
        unchanged_count=unchanged_count,
        duplicate_count=duplicate_count,
        rejected_count=rejected_count,
        created_site_ids=tuple(created_site_ids),
        notices=tuple(notices),
    )


def sync_sites(rows: list[object]) -> SyncResult:
    """Atomically reconcile the complete desired active site set."""
    valid_rows: list[tuple[int, _ValidRow]] = []
    seen_pairs: set[tuple[str, str]] = set()
    duplicate_count = 0
    notices: list[ImportNotice] = []

    for row_number, row in enumerate(rows, start=1):
        valid_row, errors = _validate_row(row)
        if valid_row is None:
            raise ValueError(f"row {row_number}: {'; '.join(errors)}")
        pair = (valid_row.normalized_name, valid_row.normalized_address)
        if pair in seen_pairs:
            duplicate_count += 1
            notices.append(
                ImportNotice(
                    kind=ImportNoticeKind.WARNING,
                    message=(
                        f"Row {row_number} skipped: duplicate normalized "
                        "name/address pair."
                    ),
                )
            )
            continue
        seen_pairs.add(pair)
        valid_rows.append((row_number, valid_row))

    with transaction.atomic():
        existing_sites = list(Site.objects.select_for_update().all())
        sites_by_pair = {
            (site.normalized_name, site.normalized_address): site
            for site in existing_sites
        }
        active_by_name: dict[str, list[Site]] = defaultdict(list)
        active_by_address: dict[str, list[Site]] = defaultdict(list)
        for site in existing_sites:
            if site.is_active:
                active_by_name[site.normalized_name].append(site)
                active_by_address[site.normalized_address].append(site)

        created_ids: list[int] = []
        reactivated_count = 0
        unchanged_count = 0
        for row_number, valid_row in valid_rows:
            pair = (valid_row.normalized_name, valid_row.normalized_address)
            matched_site = sites_by_pair.get(pair)
            if matched_site is None:
                notices.extend(
                    _creation_ambiguity_notices(
                        row_number, valid_row, active_by_name, active_by_address
                    )
                )
                matched_site = Site.objects.create(
                    name=valid_row.name,
                    address=valid_row.address,
                )
                created_ids.append(matched_site.id)
                sites_by_pair[pair] = matched_site
                _index_active(active_by_name, active_by_address, matched_site)
            elif matched_site.is_active:
                unchanged_count += 1
            else:
                matched_site.is_active = True
                matched_site.save(update_fields=("is_active", "updated_at"))
                reactivated_count += 1
                _index_active(active_by_name, active_by_address, matched_site)

        omitted = [
            site
            for pair, site in sites_by_pair.items()
            if site.is_active and pair not in seen_pairs
        ]
        for site in omitted:
            site.is_active = False
            site.save(update_fields=("is_active", "updated_at"))

    return SyncResult(
        created_count=len(created_ids),
        reactivated_count=reactivated_count,
        unchanged_count=unchanged_count,
        deactivated_count=len(omitted),
        duplicate_count=duplicate_count,
        created_site_ids=tuple(created_ids),
        notices=tuple(notices),
    )
