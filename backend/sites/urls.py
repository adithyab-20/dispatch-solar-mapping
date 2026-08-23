from django.urls import path

from sites.views import SiteDetailView, SiteListView

app_name = "sites"

urlpatterns = [
    path("sites/", SiteListView.as_view(), name="site-list"),
    path("sites/<int:pk>/", SiteDetailView.as_view(), name="site-detail"),
]
