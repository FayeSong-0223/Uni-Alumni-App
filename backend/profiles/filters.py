import django_filters

from profiles.models import Profile

# NOTE: `companies` is intentionally NOT a filter — per spec, companies only
# surface through search-bar autocomplete, never as a structured filter.


class ProfileFilter(django_filters.FilterSet):
    industry = django_filters.CharFilter(field_name="industry", lookup_expr="exact")
    graduation_year = django_filters.NumberFilter(
        field_name="graduation_year", lookup_expr="exact"
    )
    graduation_year_min = django_filters.NumberFilter(
        field_name="graduation_year", lookup_expr="gte"
    )
    graduation_year_max = django_filters.NumberFilter(
        field_name="graduation_year", lookup_expr="lte"
    )
    expertise = django_filters.CharFilter(
        field_name="expertise", lookup_expr="icontains"
    )
    hobbies = django_filters.CharFilter(
        field_name="hobbies", lookup_expr="icontains"
    )
    professional_interests = django_filters.CharFilter(
        field_name="professional_interests", lookup_expr="icontains"
    )
    name = django_filters.CharFilter(field_name="name", lookup_expr="icontains")

    class Meta:
        model = Profile
        fields = [
            "industry",
            "graduation_year",
            "graduation_year_min",
            "graduation_year_max",
            "expertise",
            "hobbies",
            "professional_interests",
            "name",
        ]
