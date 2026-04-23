from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenRefreshView

from users.views import TwoFactorLoginView, TwoFactorVerifyView

urlpatterns = [
    path('admin/', admin.site.urls),

    # JWT token endpoints (2FA-aware)
    path('api/token/', TwoFactorLoginView.as_view(), name='token_obtain_pair'),
    path('api/token/2fa-verify/', TwoFactorVerifyView.as_view(), name='token_2fa_verify'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # App endpoints
    path('api/auth/', include('users.urls')),
    path('api/profiles/', include('profiles.urls')),
    path('api/connections/', include('connections.urls')),
    path('api/messaging/', include('messaging.urls')),
    path('api/', include('activities.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
