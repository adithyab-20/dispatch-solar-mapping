.PHONY: import

import:
	cd backend && uv run python manage.py import_sites ../data/sites_initial.json --mode sync
