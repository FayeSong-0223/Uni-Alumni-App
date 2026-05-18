from django.apps import AppConfig


class ActivitiesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'activities'

    def ready(self):
        # Register post_save signal that recomputes Activity.embedding.
        from . import signals  # noqa: F401