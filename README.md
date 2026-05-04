# CLEP — Calculator for Laser Experimentation Process

Self-contained Flask web app for the laser facility. Runs on a Raspberry Pi 5
on the local network. No internet required. Open in Chrome on any device on
the same Wi-Fi.

## Stack

- Python 3.12 + Flask
- SQLite (stdlib `sqlite3`)
- Vanilla HTML / CSS / JavaScript — no build step

## Files

```
clep/
├── app.py              Flask routes
├── database.py         SQLite schema, seed, DAO
├── calculations.py     Gaussian beam math
├── start.sh            Launch script (binds 0.0.0.0:5000)
├── requirements.txt
├── static/             style.css, animation.js, calculator.js, logo.svg
├── templates/index.html
└── clep.db             Created on first launch
```

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
chmod +x start.sh
./start.sh
```

Then open `http://<pi-ip>:5000` from any device on the LAN.
The database is auto-created and seeded on first run with one Galvo Scanner
(Sinogalvo RC1001C-V1) and one F-Theta Lens (JG JG-SL-1064-163-110-10L).

## Deploy on a Raspberry Pi (one command)

SSH into the Pi as `pi` and run:

```bash
sudo apt-get install -y git
git clone https://github.com/Material-Hybrid-Manufacturing/CLEP.git /home/pi/clep
cd /home/pi/clep
chmod +x start.sh deploy/install.sh deploy/update.sh
./deploy/install.sh
sudo reboot
```

`deploy/install.sh` is idempotent. It installs system packages, sets the
hostname to `clep`, creates a virtualenv, installs Python deps, drops three
systemd units in place, and enables them:

| Unit | Purpose |
|---|---|
| `clep.service` | Runs the Flask app via the venv. `Restart=on-failure`. |
| `clep-update.service` | Oneshot — runs `deploy/update.sh`. |
| `clep-update.timer` | Fires `clep-update.service` 2 min after boot, then every 5 min. |

`deploy/update.sh` does `git fetch + git reset --hard origin/main`, reinstalls
deps if `requirements.txt` changed, and restarts `clep.service` only if the
commit hash actually moved. End-to-end, `git push origin main` from your
laptop reaches the Pi within ~5 minutes — no SSH needed for routine releases.

View logs:

```bash
sudo journalctl -u clep.service -f
sudo journalctl -u clep-update.service -n 20
```

## Reach the app at `clep.local`

Set the Pi's hostname and install Avahi so the app is reachable by name from
any device on the same Wi-Fi:

```bash
sudo hostnamectl set-hostname clep
sudo apt update
sudo apt install -y avahi-daemon
sudo systemctl enable --now avahi-daemon
```

Reboot once. The app is then reachable at `http://clep.local:5000`.

- macOS, iOS, Linux: works out of the box (Bonjour / mDNS native).
- Windows 10+: built-in mDNS resolution since 2018; usually resolves. If not,
  install Apple's Bonjour Print Services or fall back to the Pi's IP address.

## Replacing the logo

`static/logo.svg` is a placeholder MATERIAL wordmark. Drop the real wordmark
SVG (white fill on transparent background) at the same path; the header expects
roughly a 6:1 aspect ratio at 28px tall.

If the file is missing or fails to load, the header falls back to the text
"MATERIAL" rendered in white — the app never breaks because of a missing
asset.

## Backup

`clep.db` lives next to `app.py`. Copy it to preserve equipment entries when
moving or reimaging the Pi. There is no edit-in-place yet — fix typos by
deleting and re-adding entries.

## API surface

| Method | Path | Notes |
|---|---|---|
| GET | `/` | App shell |
| POST | `/calculate` | JSON in, JSON out |
| GET | `/equipment/<kind>` | `kind` ∈ `galvo`, `lens`, `expander` |
| POST | `/equipment/<kind>` | Insert |
| DELETE | `/equipment/<kind>/<id>` | Remove |
| GET | `/sensor/z` | **Stub** — hardcoded `{"z_mm": 100.0}` until the live sensor is wired |
| GET | `/version` | Reads `version.txt`, returns `{"version": "x.y"}` |

## Versioning

`version.txt` at the project root is the single source of truth for the app
version, rendered as `v<version>` in the bottom-left of the UI. The
`.github/workflows/version.yml` action auto-increments the minor number on
every push to `main` and creates a matching GitHub release. Bump the major
number manually by editing `version.txt` (e.g. `1.42` → `2.0`); CI will then
continue from `2.1`, `2.2`, etc.

## Future stubs already in place

- `/sensor/z` route — replace stub with real hardware read.
- "Energy Density / Fluence — Coming Soon" panel under the calculator equations.
- "Z Axis Calibration — Coming Soon" panel under the calculator equations.
