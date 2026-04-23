from django.urls import path

from . import views

app_name = "connections"

urlpatterns = [
    path("send/", views.SendContactRequestView.as_view(), name="send"),
    path("received/", views.ReceivedRequestsView.as_view(), name="received"),
    path("sent/", views.SentRequestsView.as_view(), name="sent"),
    path("<int:pk>/respond/", views.RespondToRequestView.as_view(), name="respond"),
    path("list/", views.ConnectionsListView.as_view(), name="list"),
]
