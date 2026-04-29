from rest_framework import serializers

from profiles.models import Company, Profile, ProfessionalInterestOption


class ProfileSerializer(serializers.ModelSerializer):
    alumni_id = serializers.CharField(source="user.alumni_id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Profile
        fields = [
            "id",
            "alumni_id",
            "username",
            "email",
            "name",
            "degree",
            "graduation_year",
            "industry",
            "expertise",
            "hobbies",
            "professional_interests",
            "companies",
            "current_role",
            "bio",
            "profile_picture",
        ]
        read_only_fields = ["id", "alumni_id", "username", "email"]

    def validate_professional_interests(self, value):
        """Reject slugs that aren't in the predefined dropdown dictionary."""
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of slugs.")
        valid_slugs = set(
            ProfessionalInterestOption.objects.filter(is_active=True).values_list(
                "slug", flat=True
            )
        )
        invalid = [v for v in value if v not in valid_slugs]
        if invalid:
            raise serializers.ValidationError(
                f"Unknown professional interest(s): {', '.join(invalid)}"
            )
        return value

    def validate_companies(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of company names.")
        cleaned = []
        seen = set()
        for raw in value:
            if not isinstance(raw, str):
                continue
            name = raw.strip()
            if not name:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(name)
        if len(cleaned) > 20:
            raise serializers.ValidationError("Maximum of 20 companies allowed.")
        return cleaned

    def update(self, instance, validated_data):
        companies = validated_data.get("companies")
        instance = super().update(instance, validated_data)
        # Grow the company dictionary for autocomplete whenever users add new names.
        if companies:
            for name in companies:
                Company.register(name)
        return instance


class PublicProfileSerializer(ProfileSerializer):
    """Profile view for users who are NOT the profile owner.

    Drops `email` so the address can't be harvested by simply browsing
    other people's profile pages. The owner sees the full ProfileSerializer
    on /me/. Connected users may also be granted email access by the view.
    """

    class Meta(ProfileSerializer.Meta):
        fields = [f for f in ProfileSerializer.Meta.fields if f != "email"]
        read_only_fields = [
            f for f in ProfileSerializer.Meta.read_only_fields if f != "email"
        ]


class ProfileListSerializer(serializers.ModelSerializer):
    alumni_id = serializers.CharField(source="user.alumni_id", read_only=True)
    # Populated by recommendation/search views; absent elsewhere.
    match_reasons = serializers.SerializerMethodField()
    match_score = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "alumni_id",
            "name",
            "degree",
            "graduation_year",
            "industry",
            "expertise",
            "hobbies",
            "professional_interests",
            "current_role",
            "profile_picture",
            "match_reasons",
            "match_score",
        ]

    def get_match_reasons(self, obj):
        return getattr(obj, "_match_reasons", [])

    def get_match_score(self, obj):
        # Normalized 0-100 relevance. None when not ranked (e.g. plain list).
        return getattr(obj, "_match_score", None)


class ProfessionalInterestOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfessionalInterestOption
        fields = ["slug", "label", "sort_order"]


class CompanySuggestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["name_display", "use_count"]
