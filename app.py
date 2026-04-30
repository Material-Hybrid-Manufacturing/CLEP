import os
import secrets

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import RequestEntityTooLarge

import calculations
import database
import experiments
import mdns

app = Flask(__name__)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "static", "uploads", "experiments"
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}

database.init_db()


@app.errorhandler(RequestEntityTooLarge)
def too_large(_):
    return jsonify({"error": "image too large (max 10 MB)"}), 413


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/calculate", methods=["POST"])
def calculate_route():
    payload = request.get_json(silent=True) or {}
    try:
        lens = database.get_row("lens", int(payload["lens_id"]))
        galvo = database.get_row("galvo", int(payload["galvo_id"]))
        prepared = calculations.prepare_inputs(payload, lens, galvo)
    except (KeyError, TypeError, ValueError) as e:
        return jsonify({"error": str(e)}), 400

    result = calculations.calculate(
        prepared["wavelength_m"],
        prepared["focal_length_m"],
        prepared["w_in_m"],
        prepared["z_offset_m"],
    )
    result["wavelength_nm"] = prepared["wavelength_nm"]
    result["w_in_mm"] = prepared["w_in_mm"]
    mismatch = calculations.wavelength_mismatch(lens, galvo)
    if mismatch:
        result["mismatch_warning"] = mismatch
    return jsonify(result)


@app.route("/equipment/<kind>", methods=["GET"])
def list_equipment(kind):
    try:
        rows = database.list_rows(kind)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(rows)


@app.route("/equipment/<kind>", methods=["POST"])
def add_equipment(kind):
    payload = request.get_json(silent=True) or {}
    try:
        row = database.insert_row(kind, payload)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(row), 201


@app.route("/equipment/<kind>/<int:row_id>", methods=["DELETE"])
def delete_equipment(kind, row_id):
    try:
        database.delete_row(kind, row_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    return ("", 204)


@app.route("/sensor/z", methods=["GET"])
def sensor_z():
    return jsonify({"z_mm": 100.0, "source": "stub"})


@app.route("/version", methods=["GET"])
def version():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "version.txt")
    try:
        with open(path) as f:
            v = f.read().strip()
    except FileNotFoundError:
        v = "0.0"
    return jsonify({"version": v})


# ---------------------------------------------------------------------------
# Experiments
# ---------------------------------------------------------------------------


def _coerce_float(payload, key):
    v = payload.get(key)
    if v in (None, ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _coerce_bool(payload, key):
    v = payload.get(key)
    if v in (None, ""):
        return 0
    if isinstance(v, bool):
        return 1 if v else 0
    s = str(v).strip().lower()
    return 1 if s in ("1", "true", "yes", "on") else 0


def _save_image(file_storage):
    if file_storage is None or not file_storage.filename:
        return None
    original = file_storage.filename
    if "." not in original:
        raise ValueError("image file is missing an extension")
    ext = original.rsplit(".", 1)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        raise ValueError(f"image extension .{ext} is not allowed")
    new_name = f"{secrets.token_hex(16)}.{ext}"
    path_on_disk = os.path.join(UPLOAD_DIR, new_name)
    file_storage.save(path_on_disk)
    return f"/static/uploads/experiments/{new_name}"


@app.route("/experiments", methods=["GET"])
def list_experiments():
    filters = experiments.parse_query_filters(request.args)
    rows = database.list_experiments(filters)
    return jsonify(rows)


@app.route("/experiments", methods=["POST"])
def create_experiment():
    if request.mimetype and request.mimetype.startswith("multipart/"):
        form = request.form
    else:
        form = request.get_json(silent=True) or {}

    try:
        image_path = None
        if "image" in request.files:
            image_path = _save_image(request.files["image"])

        power = _coerce_float(form, "power")
        scan_speed = _coerce_float(form, "scan_speed")
        spot_diameter = _coerce_float(form, "spot_diameter")
        hatch_distance = _coerce_float(form, "hatch_distance")
        layer_thickness = _coerce_float(form, "layer_thickness")
        fluence, ved = experiments.calc_metrics(
            power, scan_speed, spot_diameter, hatch_distance, layer_thickness
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    payload = {
        "specimen_label": (form.get("specimen_label") or "").strip() or None,
        "test_type": (form.get("test_type") or "").strip() or None,
        "galvo_scanner": (form.get("galvo_scanner") or "").strip() or None,
        "f_theta_lens": (form.get("f_theta_lens") or "").strip() or None,
        "laser_diode": (form.get("laser_diode") or "").strip() or None,
        "beam_expander": _coerce_bool(form, "beam_expander"),
        "beam_expander_model": (form.get("beam_expander_model") or "").strip() or None,
        "power": power,
        "scan_speed": scan_speed,
        "spot_diameter": spot_diameter,
        "hatch_distance": hatch_distance,
        "layer_thickness": layer_thickness,
        "scan_strategy": (form.get("scan_strategy") or "").strip() or None,
        "fluence": fluence,
        "ved": ved,
        "image_path": image_path,
        "notes": (form.get("notes") or "").strip() or None,
    }
    row = database.insert_experiment(payload)
    return jsonify(row), 201


@app.route("/experiments/preview", methods=["POST"])
def preview_experiment():
    payload = request.get_json(silent=True) or {}
    try:
        fluence, ved = experiments.calc_metrics(
            _coerce_float(payload, "power"),
            _coerce_float(payload, "scan_speed"),
            _coerce_float(payload, "spot_diameter"),
            _coerce_float(payload, "hatch_distance"),
            _coerce_float(payload, "layer_thickness"),
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"fluence": fluence, "ved": ved})


@app.route("/experiments/test-types", methods=["GET"])
def list_test_types_route():
    return jsonify(database.list_test_types())


@app.route("/experiments/test-types", methods=["POST"])
def add_test_type_route():
    payload = request.get_json(silent=True) or {}
    try:
        row = database.insert_test_type(payload.get("name"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(row), 201


@app.route("/experiments/test-types/<int:row_id>", methods=["DELETE"])
def delete_test_type_route(row_id):
    database.delete_test_type(row_id)
    return ("", 204)


@app.route("/experiments/filter-options", methods=["GET"])
def filter_options_route():
    return jsonify(database.filter_options())


if __name__ == "__main__":
    mdns.publish(hostname="clep", port=80)
    app.run(host="0.0.0.0", port=5000, debug=False)
