from django.urls import path

from profiles.views import (
    AvatarUploadView,
    EnhancedProfileSearchView,
    MyProfileView,
    ProfessionalInterestsListView,
    ProfileDetailView,
    ProfileSearchView,
    autocomplete_suggestions,
    companies_autocomplete,
)

app_name = "profiles"

urlpatterns = [
    path("me/", MyProfileView.as_view(), name="my-profile"),
    path("me/avatar/", AvatarUploadView.as_view(), name="avatar-upload"),
    path("search/", ProfileSearchView.as_view(), name="profile-search"),
    path("search/enhanced/", EnhancedProfileSearchView.as_view(), name="enhanced-search"),
    path("autocomplete/", autocomplete_suggestions, name="autocomplete"),
    path("autocomplete/companies/", companies_autocomplete, name="companies-autocomplete"),
    path(
        "options/professional-interests/",
        ProfessionalInterestsListView.as_view(),
        name="professional-interests",
    ),
    path("<str:alumni_id>/", ProfileDetailView.as_view(), name="profile-detail"),
]
