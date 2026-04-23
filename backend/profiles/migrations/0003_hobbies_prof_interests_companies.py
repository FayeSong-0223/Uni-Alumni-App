"""
Schema changes for profile redesign:
  - Rename Profile.interests -> Profile.hobbies (preserves data)
  - Add Profile.professional_interests (JSONField, list)
  - Add Profile.companies (JSONField, list)
  - Create ProfessionalInterestOption (dropdown dictionary)
  - Create Company (normalized autocomplete catalog)
  - Seed ProfessionalInterestOption with a sensible default set
"""

from django.db import migrations, models


DEFAULT_PROFESSIONAL_INTERESTS = [
    ("software-engineering", "Software Engineering", 10),
    ("data-science", "Data Science", 20),
    ("machine-learning", "Machine Learning / AI", 30),
    ("product-management", "Product Management", 40),
    ("design-ux", "Design / UX", 50),
    ("marketing", "Marketing", 60),
    ("sales", "Sales", 70),
    ("finance", "Finance", 80),
    ("consulting", "Consulting", 90),
    ("entrepreneurship", "Entrepreneurship", 100),
    ("operations", "Operations", 110),
    ("human-resources", "Human Resources", 120),
    ("legal", "Legal", 130),
    ("healthcare", "Healthcare", 140),
    ("education", "Education", 150),
    ("research", "Research", 160),
    ("cybersecurity", "Cybersecurity", 170),
    ("cloud-devops", "Cloud / DevOps", 180),
    ("media-journalism", "Media / Journalism", 190),
    ("public-sector", "Public Sector / Government", 200),
    ("nonprofit", "Nonprofit / Social Impact", 210),
    ("engineering-hardware", "Hardware Engineering", 220),
    ("biotech", "Biotech / Life Sciences", 230),
    ("sustainability", "Sustainability / Climate", 240),
]


def seed_professional_interests(apps, schema_editor):
    Option = apps.get_model("profiles", "ProfessionalInterestOption")
    for slug, label, sort_order in DEFAULT_PROFESSIONAL_INTERESTS:
        Option.objects.update_or_create(
            slug=slug,
            defaults={"label": label, "sort_order": sort_order, "is_active": True},
        )


def unseed_professional_interests(apps, schema_editor):
    Option = apps.get_model("profiles", "ProfessionalInterestOption")
    Option.objects.filter(
        slug__in=[slug for slug, _, _ in DEFAULT_PROFESSIONAL_INTERESTS]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0002_initial"),
    ]

    operations = [
        # 1. Rename interests -> hobbies (keeps existing JSON data intact)
        migrations.RenameField(
            model_name="profile",
            old_name="interests",
            new_name="hobbies",
        ),
        # 2. Add new JSON list fields
        migrations.AddField(
            model_name="profile",
            name="professional_interests",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="profile",
            name="companies",
            field=models.JSONField(blank=True, default=list),
        ),
        # 3. Dictionary models
        migrations.CreateModel(
            name="ProfessionalInterestOption",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=80, unique=True)),
                ("label", models.CharField(max_length=120)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["sort_order", "label"]},
        ),
        migrations.CreateModel(
            name="Company",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name_normalized", models.CharField(db_index=True, max_length=255, unique=True)),
                ("name_display", models.CharField(max_length=255)),
                ("use_count", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-use_count", "name_display"], "verbose_name_plural": "Companies"},
        ),
        # 4. Seed professional interest options
        migrations.RunPython(seed_professional_interests, reverse_code=unseed_professional_interests),
    ]
