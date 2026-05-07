import math


def calculate(wavelength_m, focal_length_m, w_in_m, z_offset_m):
    w0 = (wavelength_m * focal_length_m) / (math.pi * w_in_m)
    z_r = (math.pi * w0**2) / wavelength_m
    wz = w0 * math.sqrt(1 + (z_offset_m / z_r) ** 2)
    return {
        "w0_um": w0 * 1e6,
        "z_r_mm": z_r * 1e3,
        "wz_um": wz * 1e6,
        "spot_diameter_um": wz * 2 * 1e6,
        "depth_of_focus_mm": z_r * 1e3,
    }


def prepare_inputs(payload, lens_row, galvo_row):
    if lens_row is None:
        raise ValueError("Select an F-Theta lens before calculating.")
    if galvo_row is None:
        raise ValueError("Select a galvo scanner before calculating.")

    wavelength_nm = float(lens_row["optimized_wavelength_nm"])
    focal_length_mm = float(lens_row["focal_length_mm"])
    z_height_mm = float(payload["z_height_mm"])

    wd_raw = lens_row.get("working_distance_mm") if isinstance(lens_row, dict) else lens_row["working_distance_mm"]
    if wd_raw is None or wd_raw == "":
        z_reference_mm = focal_length_mm
    else:
        z_reference_mm = float(wd_raw)

    if payload.get("expander_on"):
        magnification = float(payload["magnification"])
        laser_diameter_mm = float(payload["laser_diameter_mm"])
        if magnification <= 0:
            raise ValueError("Magnification must be positive.")
        if laser_diameter_mm <= 0:
            raise ValueError("Laser beam diameter must be positive.")
        w_in_mm = (laser_diameter_mm / 2.0) * magnification
    else:
        limiting_aperture_mm = min(
            float(galvo_row["input_aperture_mm"]),
            float(lens_row["input_aperture_mm"]),
        )
        w_in_mm = limiting_aperture_mm / 2.0

    if focal_length_mm <= 0:
        raise ValueError("Focal length must be positive.")
    if wavelength_nm <= 0:
        raise ValueError("Wavelength must be positive.")
    if w_in_mm <= 0:
        raise ValueError("Input beam radius must be positive.")

    return {
        "wavelength_m": wavelength_nm * 1e-9,
        "focal_length_m": focal_length_mm * 1e-3,
        "w_in_m": w_in_mm * 1e-3,
        "z_offset_m": (z_height_mm - z_reference_mm) * 1e-3,
        "wavelength_nm": wavelength_nm,
        "w_in_mm": w_in_mm,
    }


def wavelength_mismatch(lens_row, galvo_row):
    if lens_row is None or galvo_row is None:
        return None
    lens_lambda = float(lens_row["optimized_wavelength_nm"])
    galvo_lambda = float(galvo_row["optimized_wavelength_nm"])
    if abs(lens_lambda - galvo_lambda) < 0.5:
        return None
    return (
        f"Wavelength mismatch: lens optimized for {lens_lambda:.0f} nm, "
        f"galvo for {galvo_lambda:.0f} nm."
    )
