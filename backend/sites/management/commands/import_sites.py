import json
from argparse import ArgumentParser
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError

from sites.services.importing import ImportNoticeKind, upsert_sites


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

        result = upsert_sites(rows)
        for notice in result.notices:
            style = (
                self.style.ERROR
                if notice.kind == ImportNoticeKind.REJECTED
                else self.style.WARNING
            )
            self.stderr.write(style(notice.message))
        self.stdout.write(self.style.SUCCESS(result.summary))
