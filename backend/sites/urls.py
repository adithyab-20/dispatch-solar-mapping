from django.urls import path

from sites.views import (
    GeocodeRefreshView,
    PVWattsRefreshView,
    SiteDeactivateView,
    SiteDetailView,
    SiteImportView,
    SiteListView,
    SolarResourceRefreshView,
)

app_name = "sites"

urlpatterns = [
    path("sites/", SiteListView.as_view(), name="site-list"),
    path("sites/import/", SiteImportView.as_view(), name="site-import"),
    path("sites/deactivate/", SiteDeactivateView.as_view(), name="site-deactivate"),
    path("sites/<int:pk>/", SiteDetailView.as_view(), name="site-detail"),
    path(
        "sites/<int:pk>/geocode/",
        GeocodeRefreshView.as_view(),
        name="site-geocode-refresh",
    ),
    path(
        "sites/<int:pk>/solar-resource/",
        SolarResourceRefreshView.as_view(),
        name="site-solar-resource-refresh",
    ),
    path(
        "sites/<int:pk>/pvwatts/",
        PVWattsRefreshView.as_view(),
        name="site-pvwatts-refresh",
    ),
]
