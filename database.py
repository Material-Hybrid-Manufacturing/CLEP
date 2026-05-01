import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "clep.db")

SCHEMA = {
    "galvo_scanners": """
        CREATE TABLE IF NOT EXISTS galvo_scanners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            manufacturer TEXT NOT NULL,
            model_number TEXT NOT NULL,
            input_aperture_mm REAL NOT NULL,
            optimized_wavelength_nm REAL NOT NULL,
            full_mechanical_angle_deg REAL,
            full_optical_angle_deg REAL,
            notes TEXT
        )
    """,
    "ftheta_lenses": """
        CREATE TABLE IF NOT EXISTS ftheta_lenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            manufacturer TEXT NOT NULL,
            model_number TEXT NOT NULL,
            focal_length_mm REAL NOT NULL,
            field_size_mm REAL,
            optimized_wavelength_nm REAL NOT NULL,
            input_aperture_mm REAL NOT NULL,
            notes TEXT
        )
    """,
    "beam_expanders": """
        CREATE TABLE IF NOT EXISTS beam_expanders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            manufacturer TEXT NOT NULL,
            model_number TEXT NOT NULL,
            magnification REAL NOT NULL,
            input_beam_diameter_mm REAL,
            output_beam_diameter_mm REAL,
            optimized_wavelength_nm REAL,
            notes TEXT
        )
    """,
    "experiment_test_types": """
        CREATE TABLE IF NOT EXISTS experiment_test_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
    """,
    "substrate_shape_types": """
        CREATE TABLE IF NOT EXISTS substrate_shape_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            builtin INTEGER NOT NULL DEFAULT 0
        )
    """,
    "substrate_templates": """
        CREATE TABLE IF NOT EXISTS substrate_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            shape TEXT NOT NULL,
            dim_a REAL NOT NULL,
            dim_b REAL,
            notes TEXT,
            beamp_filename TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "experiments": """
        CREATE TABLE IF NOT EXISTS experiments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            specimen_label TEXT,
            test_type TEXT,
            galvo_scanner TEXT,
            f_theta_lens TEXT,
            laser_diode TEXT,
            beam_expander INTEGER DEFAULT 0,
            beam_expander_model TEXT,
            power REAL,
            scan_speed REAL,
            spot_diameter REAL,
            hatch_distance REAL,
            layer_thickness REAL,
            scan_strategy TEXT,
            fluence REAL,
            ved REAL,
            image_path TEXT,
            notes TEXT
        )
    """,
}

EXPERIMENT_FIELDS = [
    "specimen_label", "test_type", "galvo_scanner", "f_theta_lens",
    "laser_diode", "beam_expander", "beam_expander_model", "power",
    "scan_speed", "spot_diameter", "hatch_distance", "layer_thickness",
    "scan_strategy", "fluence", "ved", "image_path", "notes",
]

DEFAULT_TEST_TYPES = ("Consolidation", "Geometric Accuracy", "Multilayer", "Other")

BUILTIN_SHAPE_TYPES = ("square", "rectangle", "circle")

KIND_TO_TABLE = {
    "galvo": "galvo_scanners",
    "lens": "ftheta_lenses",
    "expander": "beam_expanders",
}

FIELDS = {
    "galvo_scanners": [
        "manufacturer", "model_number", "input_aperture_mm",
        "optimized_wavelength_nm", "full_mechanical_angle_deg",
        "full_optical_angle_deg", "notes",
    ],
    "ftheta_lenses": [
        "manufacturer", "model_number", "focal_length_mm", "field_size_mm",
        "optimized_wavelength_nm", "input_aperture_mm", "notes",
    ],
    "beam_expanders": [
        "manufacturer", "model_number", "magnification",
        "input_beam_diameter_mm", "output_beam_diameter_mm",
        "optimized_wavelength_nm", "notes",
    ],
}


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def table_for(kind):
    if kind not in KIND_TO_TABLE:
        raise ValueError(f"unknown equipment kind: {kind}")
    return KIND_TO_TABLE[kind]


def init_db():
    with connect() as conn:
        for ddl in SCHEMA.values():
            conn.execute(ddl)
        seed_if_empty(conn)


def seed_if_empty(conn):
    galvo_count = conn.execute("SELECT COUNT(*) FROM galvo_scanners").fetchone()[0]
    if galvo_count == 0:
        conn.execute(
            """INSERT INTO galvo_scanners
               (manufacturer, model_number, input_aperture_mm,
                optimized_wavelength_nm, full_mechanical_angle_deg,
                full_optical_angle_deg, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("Sinogalvo", "RC1001C-V1", 10.0, 1064.0, 40.0, 80.0, "Seed entry"),
        )

    lens_count = conn.execute("SELECT COUNT(*) FROM ftheta_lenses").fetchone()[0]
    if lens_count == 0:
        conn.execute(
            """INSERT INTO ftheta_lenses
               (manufacturer, model_number, focal_length_mm, field_size_mm,
                optimized_wavelength_nm, input_aperture_mm, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("JG", "JG-SL-1064-163-110-10L", 163.0, 110.0, 1064.0, 10.0, "Seed entry"),
        )

    for name in DEFAULT_TEST_TYPES:
        conn.execute(
            "INSERT OR IGNORE INTO experiment_test_types (name) VALUES (?)",
            (name,),
        )

    for name in BUILTIN_SHAPE_TYPES:
        conn.execute(
            "INSERT OR IGNORE INTO substrate_shape_types (name, builtin) VALUES (?, 1)",
            (name,),
        )


def list_rows(kind):
    table = table_for(kind)
    with connect() as conn:
        rows = conn.execute(f"SELECT * FROM {table} ORDER BY id ASC").fetchall()
        return [dict(r) for r in rows]


def get_row(kind, row_id):
    table = table_for(kind)
    with connect() as conn:
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone()
        return dict(row) if row else None


def insert_row(kind, payload):
    table = table_for(kind)
    cols = FIELDS[table]
    values = [payload.get(c) for c in cols]
    placeholders = ", ".join(["?"] * len(cols))
    col_list = ", ".join(cols)
    with connect() as conn:
        cur = conn.execute(
            f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})", values
        )
        new_id = cur.lastrowid
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (new_id,)).fetchone()
        return dict(row)


def delete_row(kind, row_id):
    table = table_for(kind)
    with connect() as conn:
        conn.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))


# ---------------------------------------------------------------------------
# Experiments + test types
# ---------------------------------------------------------------------------


def list_test_types():
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM experiment_test_types ORDER BY name COLLATE NOCASE ASC"
        ).fetchall()
        return [dict(r) for r in rows]


def insert_test_type(name):
    name = (name or "").strip()
    if not name:
        raise ValueError("test type name is required")
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO experiment_test_types (name) VALUES (?)",
            (name,),
        )
        row = conn.execute(
            "SELECT * FROM experiment_test_types WHERE name = ?", (name,)
        ).fetchone()
        return dict(row) if row else None


def delete_test_type(row_id):
    with connect() as conn:
        conn.execute("DELETE FROM experiment_test_types WHERE id = ?", (row_id,))


def insert_experiment(payload):
    """Insert an experiment row. payload keys must be a subset of EXPERIMENT_FIELDS."""
    cols = EXPERIMENT_FIELDS
    values = [payload.get(c) for c in cols]
    placeholders = ", ".join(["?"] * len(cols))
    col_list = ", ".join(cols)
    with connect() as conn:
        cur = conn.execute(
            f"INSERT INTO experiments ({col_list}) VALUES ({placeholders})", values
        )
        new_id = cur.lastrowid
        row = conn.execute(
            "SELECT * FROM experiments WHERE id = ?", (new_id,)
        ).fetchone()
        return dict(row)


def update_experiment_notes(row_id, notes):
    notes = notes if notes is None else (str(notes).strip() or None)
    with connect() as conn:
        cur = conn.execute(
            "UPDATE experiments SET notes = ? WHERE id = ?", (notes, row_id)
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT * FROM experiments WHERE id = ?", (row_id,)
        ).fetchone()
        return dict(row) if row else None


def get_experiment(row_id):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM experiments WHERE id = ?", (row_id,)
        ).fetchone()
        return dict(row) if row else None


def list_experiments(filters=None):
    """List experiments, newest first. Optionally filtered.

    `filters` is the dict produced by experiments.parse_query_filters and is
    passed through to experiments.build_filter_clause for parameterized SQL."""
    from experiments import build_filter_clause  # local import to avoid cycle

    where_sql, params = build_filter_clause(filters or {})
    sql = "SELECT * FROM experiments"
    if where_sql:
        sql += " WHERE " + where_sql
    sql += " ORDER BY datetime(created_at) DESC, id DESC"
    with connect() as conn:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]


def list_substrate_templates():
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM substrate_templates ORDER BY datetime(created_at) ASC, id ASC"
        ).fetchall()
        return [dict(r) for r in rows]


def get_substrate_template(row_id):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM substrate_templates WHERE id = ?", (row_id,)
        ).fetchone()
        return dict(row) if row else None


def insert_substrate_template(payload):
    cols = ["name", "shape", "dim_a", "dim_b", "notes", "beamp_filename"]
    values = [payload.get(c) for c in cols]
    placeholders = ", ".join(["?"] * len(cols))
    col_list = ", ".join(cols)
    with connect() as conn:
        cur = conn.execute(
            f"INSERT INTO substrate_templates ({col_list}) VALUES ({placeholders})",
            values,
        )
        new_id = cur.lastrowid
        row = conn.execute(
            "SELECT * FROM substrate_templates WHERE id = ?", (new_id,)
        ).fetchone()
        return dict(row)


def delete_substrate_template(row_id):
    with connect() as conn:
        conn.execute("DELETE FROM substrate_templates WHERE id = ?", (row_id,))


def list_substrate_shape_types():
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM substrate_shape_types ORDER BY builtin DESC, name COLLATE NOCASE ASC"
        ).fetchall()
        return [dict(r) for r in rows]


def insert_substrate_shape_type(name):
    name = (name or "").strip()
    if not name:
        raise ValueError("shape type name is required")
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO substrate_shape_types (name, builtin) VALUES (?, 0)",
            (name,),
        )
        row = conn.execute(
            "SELECT * FROM substrate_shape_types WHERE name = ?", (name,)
        ).fetchone()
        return dict(row) if row else None


def delete_substrate_shape_type(row_id):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM substrate_shape_types WHERE id = ?", (row_id,)
        ).fetchone()
        if row is None:
            return False
        in_use = conn.execute(
            "SELECT COUNT(*) FROM substrate_templates WHERE shape = ?", (row["name"],)
        ).fetchone()[0]
        if in_use:
            raise ValueError(
                f"shape type '{row['name']}' is in use by {in_use} template(s)"
            )
        conn.execute("DELETE FROM substrate_shape_types WHERE id = ?", (row_id,))
        return True


def shape_type_names():
    with connect() as conn:
        rows = conn.execute("SELECT name FROM substrate_shape_types").fetchall()
        return {r["name"] for r in rows}


def filter_options():
    out = {}
    cols = {
        "galvo_scanners": "galvo_scanner",
        "f_theta_lenses": "f_theta_lens",
        "laser_diodes": "laser_diode",
    }
    with connect() as conn:
        for key, col in cols.items():
            rows = conn.execute(
                f"SELECT DISTINCT {col} AS v FROM experiments "
                f"WHERE {col} IS NOT NULL AND TRIM({col}) != '' "
                f"ORDER BY {col} COLLATE NOCASE ASC"
            ).fetchall()
            out[key] = [r["v"] for r in rows]
    return out
