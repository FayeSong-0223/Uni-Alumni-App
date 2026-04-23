from django.urls import path

from . import views

app_name = "messaging"

urlpatterns = [
    path("send/", views.SendMessageView.as_view(), name="send"),
    path("inbox/", views.InboxView.as_view(), name="inbox"),
    path("sent/", views.SentMessagesView.as_view(), name="sent"),
    path("<int:pk>/", views.MessageDetailView.as_view(), name="detail"),
    path(
        "conversation/<str:alumni_id>/",
        views.ConversationView.as_view(),
        name="conversation",
    ),
]
