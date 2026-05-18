# Generated for semantic search — adds a JSONField to hold the per-activity
# sentence-transformers embedding (384 floats, all-MiniLM-L6-v2).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('activities', '0003_rename_act_del_end_idx_activities__is_dele_ef1836_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='activity',
            name='embedding',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
