#!/bin/sh
# Apply migrations, then serve with gunicorn.
set -e

python manage.py migrate --noinput

# Build the admin's hashed/compressed static assets (served by WhiteNoise).
python manage.py collectstatic --noinput

exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --access-logfile - \
    --error-logfile -
