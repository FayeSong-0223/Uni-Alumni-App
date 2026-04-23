from django.urls import path

from . import views

app_name = "users"

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("me/", views.UserProfileView.as_view(), name="me"),
    path("change-password/", views.ChangePasswordView.as_view(), name="change-password"),

    # 2FA / TOTP
    path("2fa/setup/", views.TOTPSetupView.as_view(), name="2fa-setup"),
    path("2fa/enable/", views.TOTPEnableView.as_view(), name="2fa-enable"),
    path("2fa/disable/", views.TOTPDisableView.as_view(), name="2fa-disable"),

    # Password reset
    path("password-reset/", views.PasswordResetRequestView.as_view(), name="password-reset"),
    path("password-reset/confirm/", views.PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
]
