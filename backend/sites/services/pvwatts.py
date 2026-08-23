from typing import Final

PVWATTS_BASE_ASSUMPTIONS: Final[dict[str, float | int | str]] = {
    "system_capacity": 100,
    "module_type": 0,
    "array_type": 0,
    "azimuth": 180,
    "losses": 14,
    "dataset": "nsrdb",
    "timeframe": "monthly",
    "dc_ac_ratio": 1.2,
    "gcr": 0.4,
    "inv_eff": 96,
    "radius": 100,
}
