#!/bin/bash
set -e

# DB_ENGINE is provided by docker-compose.yml so that BOTH this entrypoint
# *and* `docker compose exec` one-off commands see the same value. We used
# to `export DB_ENGINE=mysql` here, but exec sessions don't inherit
# exports from the entrypoint shell, so manage.py shell / backfill /
# eval would silently fall through to the SQLite branch in settings.py
# and query the wrong database. Defined once in compose now — don't
# re-export it here.

echo "Waiting for MySQL..."
while ! python -c "
import MySQLdb
MySQLdb.connect(
    host='${DB_HOST:-db}',
    port=int('${DB_PORT:-3306}'),
    user='${DB_USER:-root}',
    passwd='${DB_PASSWORD:-alumni_pass}'
)
" 2>/dev/null; do
    echo "MySQL is unavailable - sleeping"
    sleep 2
done
echo "MySQL is up!"

echo "Creating migrations..."
python manage.py makemigrations --noinput

echo "Running migrations..."
python manage.py migrate --noinput

# Create a superuser only if all three env vars are provided.
# This avoids shipping a predictable admin/admin123 account in any
# environment where the operator hasn't explicitly opted in.
if [ -n "${DJANGO_SUPERUSER_USERNAME}" ] && \
   [ -n "${DJANGO_SUPERUSER_EMAIL}" ] && \
   [ -n "${DJANGO_SUPERUSER_PASSWORD}" ]; then
    echo "Creating superuser if needed..."
    python manage.py shell -c "
import os
from django.contrib.auth import get_user_model
User = get_user_model()
username = os.environ['DJANGO_SUPERUSER_USERNAME']
if not User.objects.filter(username=username).exists():
    User.objects.create_superuser(
        username,
        os.environ['DJANGO_SUPERUSER_EMAIL'],
        os.environ['DJANGO_SUPERUSER_PASSWORD'],
    )
    print('Superuser created')
else:
    print('Superuser exists')
"
else
    echo "Skipping superuser creation (set DJANGO_SUPERUSER_USERNAME/EMAIL/PASSWORD to enable)."
fi

echo "Starting server..."
python manage.py runserver 0.0.0.0:8000
