from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_user_is_2fa_enabled_user_password_reset_code_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='pending_totp_secret',
            field=models.CharField(blank=True, default='', max_length=32),
        ),
    ]
