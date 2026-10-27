# Neon Rush

Neon Rush is a responsive Django driving game with a browser-based 3D arcade
mode, a 2D fallback, player accounts, a vehicle garage, upgrades, FAQs, and a
support assistant.

- **Live site:** <https://santhosh-app-z0hg.onrender.com/>
- **GitHub:** <https://github.com/santhoshparthasarathy304-cmd/santhosh-app>

## Features

- Procedural Three.js driving scene with traffic, road markings, buildings,
  lighting, camera options, keyboard controls, and mobile touch controls.
- Existing 2D game remains available as a fallback if WebGL or the Three.js
  CDN is unavailable. The 3D scene is an arcade game, not a simulator.
- Account signup/login and a garage with purchasable cars, selectable vehicles,
  once-per-day credits, and tires, engine, braking, and lighting upgrades.
  Purchases are checked and recorded by Django; request IDs prevent duplicate
  charges on retries.
- Upgrades feed into vehicle specifications used by the game. Player balances,
  ownership, upgrades, transactions, and scores are stored in SQL.
- At least 10 SQL-backed FAQs, an assistant widget across the site, a documented
  error guide (`400`, `401`, `403`, `404`, `429`, `500`, `503`, and `NR-100`),
  and custom 400/403/404/500 pages with an **Ask the Assistant** option.
- The assistant uses FAQ/error guidance, can call Gemini when configured, and
  creates a support ticket for unanswered questions. Chat and feedback are
  stored in SQL and mirrored to MongoDB when configured.
- Request logging and a SQL-backed `/healthz/` endpoint.
- Optional location-based road weather from Open-Meteo. The browser asks for
  location permission only after the player selects the weather control; the
  endpoint has a timeout and a fallback.

## Run locally

Use Python 3.12 or later and install `requirements.txt`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open <http://127.0.0.1:8000/>. The game uses SQLite locally by default. Run the
tests with:

```powershell
python manage.py test game
```

## Configuration

Set environment variables in the hosting provider's secret/configuration
interface, not in source files or the browser:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Production | Private Django signing key |
| `DJANGO_DEBUG` | Production | Set to `False` |
| `DJANGO_ALLOWED_HOSTS` | Production | Comma-separated host names |
| `DATABASE_URL` | Production persistence | PostgreSQL pooled connection URL; without it, SQLite is used |
| `DIRECT_DATABASE_URL` | PostgreSQL migrations | Direct connection URL used by the Render start command |
| `GEMINI_API_KEY` | Optional | Enables Gemini answers; remains server-side |
| `GEMINI_MODEL` | Optional | Gemini model name |
| `MONGODB_URI` | Optional | Enables MongoDB mirroring for chat and feedback |
| `MONGODB_DATABASE` | Optional | MongoDB database name (defaults to `neon_rush`) |

If Gemini is not configured, FAQ/error answers and ticket creation remain
available. Without `MONGODB_URI`, chat and feedback are still stored in SQL.
No API keys or database credentials belong in GitHub.

## Render deployment and persistence

The existing free Render web service deploys this repository's `main` branch.
Its filesystem is ephemeral; SQLite data can be lost when the service
restarts. Configure a managed PostgreSQL URL before relying on player accounts,
balances, purchases, or scores to survive a restart.

The app supports PostgreSQL and the project has already been prepared for
pooled/direct PostgreSQL URLs. A free Neon plan is one option, but availability
and limits can change; choose a $0 plan and review its terms before creating a
database. Do not enable a paid service without approval. In Render, set
`DATABASE_URL` to the pooled URL and `DIRECT_DATABASE_URL` to the direct URL.
The start command should be:

```text
DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}" python manage.py migrate --noinput && gunicorn myproject.wsgi:application
```

This runs migrations using the direct URL and starts Gunicorn with the pooled
URL. Set the optional Gemini and MongoDB variables in Render only when those
services are provisioned. Neither external integration is required for the
FAQ/ticket fallback.

The local SQLite backup contains 14 pre-upgrade game scores and is excluded
from Git. It is not the Render database. Before any database cutover, inspect
the current live leaderboard and preserve any production-only entries; local
and production SQLite files cannot be assumed to contain the same rows.

## Proposed future improvement

Replace the procedural 3D car and scenery with properly licensed, optimized
vehicle and environment assets while retaining the existing 2D fallback.
