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

The SQLite database and environment files are intentionally excluded from Git.
Run `python manage.py migrate` to create a fresh local database.

## Game controls

- Left/right arrows or **A**/**D**: steer
- **P** or **Escape**: pause or resume
- **Enter**: resume from a pit stop
