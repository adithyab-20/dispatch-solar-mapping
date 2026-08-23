from rest_framework import generics

from sites.models import Site
from sites.serializers import SiteDetailSerializer, SiteListSerializer

ACTIVE_SITE_QUERYSET = Site.objects.filter(is_active=True)


class SiteListView(generics.ListAPIView[Site]):
    queryset = ACTIVE_SITE_QUERYSET
    serializer_class = SiteListSerializer
    http_method_names = ["get", "head", "options"]


class SiteDetailView(generics.RetrieveAPIView[Site]):
    queryset = ACTIVE_SITE_QUERYSET
    serializer_class = SiteDetailSerializer
    http_method_names = ["get", "head", "options"]
