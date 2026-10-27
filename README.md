# Neon Rush

A browser-based, three-lane arcade racing game built with Django, HTML, CSS, and
JavaScript. Dodge traffic, collect coins, avoid oil slicks, and save your best
runs to the leaderboard.

## Requirements

- Python 3.10 or later
- Dependencies from `requirements.txt`

## Run locally

From the project directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open <http://127.0.0.1:8000/> and choose **Start your engine**.

## Tests

```powershell
python manage.py test game
```

## Configuration

The local development settings work without environment variables. Before
deploying to a hosting provider, configure:

- `DJANGO_SECRET_KEY`: a unique, private Django secret key.
- `DJANGO_DEBUG`: set to `False`.
- `DJANGO_ALLOWED_HOSTS`: comma-separated host names for the deployment.
- `DATABASE_URL`: optional PostgreSQL connection URL. When set, Django uses
  PostgreSQL over SSL; without it, local development uses SQLite.

The SQLite database, database backups, and environment files are intentionally
excluded from Git. Run `python manage.py migrate` to create a fresh local
database.

## Deploy on Render

The existing Render service uses a free web instance and deploys this Django
project from GitHub. Its local SQLite file is ephemeral and can be lost when
the service restarts.

Render's free PostgreSQL databases are also temporary: they expire after 30
days and are deleted after a further 14-day recovery window. Do not use one for
persistent player data.

### Optional free PostgreSQL on Neon

Neon's current Free plan is permanent, requires no credit card, and includes
up to 1 GB of storage per project. Compute automatically scales to zero after
inactivity, so the first connection can take a few seconds. The free plan has
a six-hour history window and one manual snapshot; it does not include
scheduled snapshots. Keep independent backups for important data. Supabase
Free is another $0 option, but projects can pause after a week of low activity
and downloadable database backups are not included.

Neon provides separate direct and pooled connection strings. The web service
uses the pooled URL; Django migrations use the direct URL because Neon's pooler
runs in transaction mode.

To migrate the existing local scores to Neon without committing credentials
or SQLite files:

1. Keep the verified SQLite backup at
   `backups\db-pre-postgres-20261027.sqlite3`. The `backups\` folder is
   excluded from Git.
2. Create a Neon project on its **Free** plan; do not select a paid plan. Copy
   both the direct and pooled PostgreSQL connection strings. Never put either
   URL in source code.
3. Before changing the Render service, export the local score rows:

   ```powershell
   python manage.py dumpdata game.GameScore --indent 2 --output backups\game-scores.json
   ```

4. In Render, open the existing `santhosh-app` web service and add
   `DATABASE_URL` with the pooled URL and `DIRECT_DATABASE_URL` with the direct
   URL. Set the service's **Start Command** to
   `DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}" python manage.py migrate --noinput && gunicorn myproject.wsgi:application`.
   Save to trigger a deploy. This runs migrations with the direct URL, then
   starts Gunicorn with the pooled URL.
5. In a local PowerShell window, use the direct URL for a one-time schema
   creation and data import:

   ```powershell
   $secureUrl = Read-Host "Paste the Neon direct connection URL" -AsSecureString
   $env:DATABASE_URL = [System.Net.NetworkCredential]::new("", $secureUrl).Password
   try {
       python manage.py migrate
       if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
       python manage.py loaddata backups\game-scores.json
       if ($LASTEXITCODE -ne 0) { throw "Score import failed." }
   } finally {
       Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
   }
   ```

   The URL prompt is masked, and the environment variable is cleared even if a
   command fails. Run `loaddata` only once; it is not an upsert operation.
6. Check the game and leaderboard on the live site. Keep the SQLite backup
   until the new database and imported row count have been verified.

The local SQLite file and Render's current SQLite file are separate databases.
The commands above export the local file only. Before switching the Render
service, preserve all production-only leaderboard entries as well. At the time
of this audit, the live leaderboard displayed two `Racer` entries (707 m, 7
coins, 770 points; and 901 m, 6 coins, 690 points). These are only the known
public entries, not a complete production export: the public leaderboard does
not expose original timestamps or guarantee every historical row. Re-check
the live data immediately before cutover, account for every production-only
row, and do not treat the sample entries below as a full backup. Add these
sample rows only if they are still missing after that check:

```powershell
python manage.py shell -c "from game.models import GameScore; GameScore.objects.create(player_name='Racer', distance=707, coins=7, score=770); GameScore.objects.create(player_name='Racer', distance=901, coins=6, score=690)"
```

The current game has no registered users, owned-car, upgrade, or currency
records to migrate; those features and their models do not exist yet.

## Game controls

- Left/right arrows or **A**/**D**: steer
- **P** or **Escape**: pause or resume
- **Enter**: resume from a pit stop
