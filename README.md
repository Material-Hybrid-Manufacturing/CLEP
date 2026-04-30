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

## Run on boot via systemd

Create `/etc/systemd/system/clep.service`:

```ini
[Unit]
Description=CLEP — Calculator for Laser Experimentation Process
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/clep
ExecStart=/home/pi/clep/start.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

If using a virtualenv, change `start.sh` to activate it before running
`python3 app.py`, or set `ExecStart=/home/pi/clep/.venv/bin/python /home/pi/clep/app.py`.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now clep
sudo systemctl status clep
```

View logs: `sudo journalctl -u clep -f`.

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
