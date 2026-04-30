import math


MULTI_SELECT_FIELDS = {
    "test_types": "test_type",
    "galvo_scanners": "galvo_scanner",
    "f_theta_lenses": "f_theta_lens",
    "laser_diodes": "laser_diode",
}

RANGE_FIELDS = ("power", "scan_speed", "fluence", "ved")


def calc_metrics(power, scan_speed, spot_diameter_um,
                 hatch_distance_um=None, layer_thickness_um=None):
    """Compute fluence (J/mm^2) and VED (J/mm^3).

    Inputs in their original units: power (W), scan_speed (mm/s),
    spot_diameter (µm), hatch_distance (µm), layer_thickness (µm).

    VED is None if hatch or layer thickness is missing/zero — that lets a
    consolidation single-track save without forcing a layer parameter."""
    if power is None or scan_speed is None or spot_diameter_um is None:
        raise ValueError("power, scan_speed, and spot_diameter are required")
    power = float(power)
    scan_speed = float(scan_speed)
    spot_diameter_um = float(spot_diameter_um)
    if power <= 0 or scan_speed <= 0 or spot_diameter_um <= 0:
        raise ValueError("power, scan_speed, and spot_diameter must be positive")

    spot_radius_mm = (spot_diameter_um / 1000.0) / 2.0
    fluence = power / (scan_speed * math.pi * spot_radius_mm ** 2)

    ved = None
    if hatch_distance_um and layer_thickness_um:
        hatch_um = float(hatch_distance_um)
        layer_um = float(layer_thickness_um)
        if hatch_um > 0 and layer_um > 0:
            hatch_mm = hatch_um / 1000.0
            layer_mm = layer_um / 1000.0
            ved = power / (scan_speed * hatch_mm * layer_mm)

    return fluence, ved


def parse_query_filters(args):
    """Pull filter values out of a Flask `request.args`-like mapping.

    Multi-select fields are comma-separated; range fields use `<base>_min`
    and `<base>_max` suffixes. Malformed numbers are silently dropped."""
    out = {}
    for key in MULTI_SELECT_FIELDS:
        v = args.get(key)
        if v:
            out[key] = [s.strip() for s in v.split(",") if s.strip()]
    for base in RANGE_FIELDS:
        for suffix in ("min", "max"):
            v = args.get(f"{base}_{suffix}")
            if v in (None, ""):
                continue
            try:
                out[f"{base}_{suffix}"] = float(v)
            except (TypeError, ValueError):
                continue
    return out


def build_filter_clause(filters):
    """Build a parameterized WHERE clause from a sanitized filter dict.

    Returns (where_sql, params). where_sql is empty string when no filters."""
    clauses = []
    params = []

    for key, column in MULTI_SELECT_FIELDS.items():
        values = filters.get(key)
        if not values:
            continue
        placeholders = ", ".join(["?"] * len(values))
        clauses.append(f"{column} IN ({placeholders})")
        params.extend(values)

    for base in RANGE_FIELDS:
        lo = filters.get(f"{base}_min")
        hi = filters.get(f"{base}_max")
        if lo is not None:
            clauses.append(f"{base} >= ?")
            params.append(float(lo))
        if hi is not None:
            clauses.append(f"{base} <= ?")
            params.append(float(hi))

    return (" AND ".join(clauses), params)
