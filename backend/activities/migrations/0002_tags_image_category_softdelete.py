"""Activity model extensions: image, tags, category, soft-delete."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("activities", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="activity",
            name="image",
            field=models.ImageField(blank=True, null=True, upload_to="activity_images/"),
        ),
        migrations.AddField(
            model_name="activity",
            name="tags",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="activity",
            name="category",
            field=models.CharField(
                blank=True,
                choices=[
                    ("networking", "Networking"),
                    ("workshop", "Workshop"),
                    ("social", "Social"),
                    ("career", "Career"),
                    ("sports", "Sports"),
                    ("volunteering", "Volunteering"),
                    ("mentorship", "Mentorship"),
                    ("other", "Other"),
                ],
                default="other",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="activity",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="activity",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="activity",
            index=models.Index(fields=["is_deleted", "end_time"], name="act_del_end_idx"),
        ),
        migrations.AddIndex(
            model_name="activity",
            index=models.Index(fields=["category"], name="act_category_idx"),
        ),
    ]
