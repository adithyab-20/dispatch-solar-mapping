import json
from argparse import ArgumentParser
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError

from sites.models import Site
from sites.services.normalization import normalize_text


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


class Command(BaseCommand):
    help = "Import named sites from a JSON file."

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument("path", type=Path)
        parser.add_argument("--mode", choices=("upsert",), required=True)

    def handle(self, *args: Any, **options: Any) -> None:
        path: Path = options["path"]
        try:
            contents = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            raise CommandError(f"Could not read {path} as UTF-8.") from error

        try:
            rows = json.loads(contents)
        except json.JSONDecodeError as error:
            raise CommandError(
                f"Invalid JSON in {path}: line {error.lineno}, column {error.colno}."
            ) from error
        if not isinstance(rows, list):
            raise CommandError("The top level must be a JSON array.")

        created_count = 0
        reactivated_count = 0
        unchanged_count = 0
        duplicate_count = 0
        rejected_count = 0
        seen_pairs: set[tuple[str, str]] = set()
        for row_number, row in enumerate(rows, start=1):
            valid_row, errors = _validate_row(row)
            if valid_row is None:
                rejected_count += 1
                self.stderr.write(
                    self.style.ERROR(f"Row {row_number} rejected: {'; '.join(errors)}.")
                )
                continue

            normalized_pair = (
                valid_row.normalized_name,
                valid_row.normalized_address,
            )
            if normalized_pair in seen_pairs:
                duplicate_count += 1
                self.stderr.write(
                    self.style.WARNING(
                        f"Row {row_number} skipped: duplicate normalized "
                        "name/address pair."
                    )
                )
                continue
            seen_pairs.add(normalized_pair)

            same_address_ids = list(
                Site.objects.filter(normalized_address=valid_row.normalized_address)
                .exclude(normalized_name=valid_row.normalized_name)
                .order_by("id")
                .values_list("id", flat=True)
            )
            if same_address_ids:
                joined_ids = ", ".join(str(site_id) for site_id in same_address_ids)
                self.stderr.write(
                    self.style.WARNING(
                        f"Row {row_number} warning: normalized address is already "
                        "used under a different normalized name "
                        f"(site IDs: {joined_ids}); records will remain separate."
                    )
                )

            same_name_ids = list(
                Site.objects.filter(normalized_name=valid_row.normalized_name)
                .exclude(normalized_address=valid_row.normalized_address)
                .order_by("id")
                .values_list("id", flat=True)
            )
            if same_name_ids:
                joined_ids = ", ".join(str(site_id) for site_id in same_name_ids)
                self.stderr.write(
                    self.style.WARNING(
                        f"Row {row_number} warning: normalized name is already used "
                        "with a different normalized address "
                        f"(site IDs: {joined_ids}); records will remain separate."
                    )
                )

            existing_site = Site.objects.filter(
                normalized_name=valid_row.normalized_name,
                normalized_address=valid_row.normalized_address,
            ).first()
            if existing_site is not None:
                if not existing_site.is_active:
                    existing_site.is_active = True
                    existing_site.save(update_fields=("is_active", "updated_at"))
                    reactivated_count += 1
                else:
                    unchanged_count += 1
                continue

            Site.objects.create(name=valid_row.name, address=valid_row.address)
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Import complete: {created_count} created, "
                f"{reactivated_count} reactivated, {unchanged_count} unchanged, "
                f"{duplicate_count} duplicate rows skipped, "
                f"{rejected_count} rejected."
            )
        )
