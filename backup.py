"""Google Drive backup of the experiments tab via rclone.

Builds a staging directory mirroring the desired Drive layout, then runs
`rclone sync` against the `gdrive` remote. Triggered automatically after
every experiment write and manually via the /backup route.
"""

import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import threading
import time
from datetime import datetime

import database

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
STAGING_DIR = os.path.join(REPO_DIR, ".backup-staging")
UPLOAD_DIR = os.path.join(REPO_DIR, "static", "uploads", "experiments")
LOG_PATH = os.path.join(REPO_DIR, "backup.log")

RCLONE_REMOTE = "gdrive:CLEP-Backup"
RCLONE_TIMEOUT_S = 600

_lock = threading.Lock()
_pending = False
_pending_lock = threading.Lock()

_logger = logging.getLogger("backup")
if not _logger.handlers:
    _handler = logging.FileHandler(LOG_PATH)
    _handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    _logger.addHandler(_handler)
    _logger.setLevel(logging.INFO)
    _logger.propagate = False


_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9_-]+")


def _sanitize_name(s):
    if not s:
        return "unlabeled"
    cleaned = _SAFE_NAME_RE.sub("_", str(s).strip())
    cleaned = cleaned.strip("_")
    if not cleaned:
        return "unlabeled"
    return cleaned[:64]


def _date_prefix(created_at):
    if not created_at:
        return "unknown-date"
    s = str(created_at)
    try:
        return datetime.fromisoformat(s.replace(" ", "T").rstrip("Z")).strftime("%Y-%m-%d")
    except ValueError:
        return s[:10] or "unknown-date"


def _snapshot_db(dest_path):
    src = sqlite3.connect(database.DB_PATH)
    try:
        dst = sqlite3.connect(dest_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _hardlink_or_copy(src, dst):
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def _build_staging():
    if os.path.exists(STAGING_DIR):
        shutil.rmtree(STAGING_DIR)
    os.makedirs(STAGING_DIR)

    _snapshot_db(os.path.join(STAGING_DIR, "clep.db"))

    rows = database.list_experiments()
    files_written = 1  # the db snapshot

    for row in rows:
        folder_name = "{date}_{label}_{id}".format(
            date=_date_prefix(row.get("created_at")),
            label=_sanitize_name(row.get("specimen_label")),
            id=row.get("id"),
        )
        folder = os.path.join(STAGING_DIR, folder_name)
        os.makedirs(folder, exist_ok=True)

        with open(os.path.join(folder, "experiment.json"), "w", encoding="utf-8") as f:
            json.dump(row, f, indent=2, sort_keys=True, default=str)
        files_written += 1

        image_path = row.get("image_path")
        if image_path:
            name = image_path.rsplit("/", 1)[-1]
            src = os.path.join(UPLOAD_DIR, name)
            ext = name.rsplit(".", 1)[-1] if "." in name else "bin"
            dst = os.path.join(folder, f"image.{ext}")
            try:
                _hardlink_or_copy(src, dst)
                files_written += 1
            except FileNotFoundError:
                _logger.warning("missing image on disk for experiment id=%s path=%s", row.get("id"), src)

    return files_written


def _rclone_sync():
    return subprocess.run(
        ["rclone", "sync", STAGING_DIR, RCLONE_REMOTE, "--fast-list"],
        capture_output=True,
        text=True,
        timeout=RCLONE_TIMEOUT_S,
    )


def run_backup(trigger):
    """Synchronous backup. Returns {ok, files, duration_s, error, trigger}."""
    start = time.monotonic()
    result = {"ok": False, "files": 0, "duration_s": 0.0, "error": None, "trigger": trigger}
    with _lock:
        try:
            result["files"] = _build_staging()
            proc = _rclone_sync()
            if proc.returncode != 0:
                tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
                result["error"] = f"rclone exit {proc.returncode}: {' | '.join(tail)}"
            else:
                result["ok"] = True
        except FileNotFoundError as e:
            result["error"] = f"rclone not installed: {e}"
        except subprocess.TimeoutExpired:
            result["error"] = f"rclone timed out after {RCLONE_TIMEOUT_S}s"
        except Exception as e:
            result["error"] = f"{type(e).__name__}: {e}"
        result["duration_s"] = round(time.monotonic() - start, 2)

    if result["ok"]:
        _logger.info("%s ok files=%d duration=%.1fs", trigger, result["files"], result["duration_s"])
    else:
        _logger.error("%s error=%r duration=%.1fs", trigger, result["error"], result["duration_s"])
    return result


def _run_with_followup(trigger):
    global _pending
    run_backup(trigger)
    while True:
        with _pending_lock:
            if not _pending:
                return
            _pending = False
        run_backup("auto:followup")


def trigger_backup_async(trigger):
    """Fire-and-forget backup. Coalesces concurrent triggers into one followup run."""
    global _pending
    if _lock.locked():
        with _pending_lock:
            _pending = True
        return
    threading.Thread(target=_run_with_followup, args=(trigger,), daemon=True).start()
