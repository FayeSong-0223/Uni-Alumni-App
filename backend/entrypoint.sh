#!/bin/bash
set -e

export DB_ENGINE=mysql

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

echo "Creating superuser if needed..."
python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@adelaide.edu.au', 'admin123')
    print('Superuser created')
else:
    print('Superuser exists')
"

echo "Starting server..."
python manage.py runserver 0.0.0.0:8000
