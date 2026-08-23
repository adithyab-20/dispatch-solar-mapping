from rest_framework import serializers

from sites.models import Site


class SiteListSerializer(serializers.ModelSerializer[Site]):
    class Meta:
        model = Site
        fields = (
            "id",
            "name",
            "address",
            "latitude",
            "longitude",
            "geocode_status",
        )
        read_only_fields = fields


class SiteDetailSerializer(serializers.ModelSerializer[Site]):
    class Meta:
        model = Site
        fields = (
            "id",
            "name",
            "address",
            "is_active",
            "latitude",
            "longitude",
            "resolved_address",
            "geocode_status",
            "geocode_error",
            "geocode_attempted_at",
            "solar_resource_status",
            "annual_ghi_kwh_m2_day",
            "annual_dni_kwh_m2_day",
            "annual_latitude_tilt_kwh_m2_day",
            "monthly_solar_data",
            "solar_resource_error",
            "solar_resource_attempted_at",
            "pvwatts_status",
            "pvwatts_assumptions",
            "annual_ac_kwh",
            "capacity_factor_percent",
            "annual_solar_radiation_kwh_m2_day",
            "monthly_pvwatts_data",
            "pvwatts_error",
            "pvwatts_attempted_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
