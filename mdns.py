import atexit
import socket
import threading

try:
    from zeroconf import ServiceInfo, Zeroconf
except ImportError:
    Zeroconf = None
    ServiceInfo = None


def _get_lan_ip():
    """Return the IP this machine uses for outbound traffic on the LAN."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()


_zc = None
_lock = threading.Lock()


def publish(hostname="clep", port=80):
    """Broadcast hostname.local on the LAN via mDNS so any device with mDNS
    support (macOS, iOS, Linux, modern Windows) can resolve it.

    Idempotent — safe to call multiple times. Returns the active Zeroconf
    handle, or None if publishing failed (e.g. zeroconf not installed,
    network unreachable, or another responder owns the name)."""
    global _zc
    if Zeroconf is None:
        print("[mdns] zeroconf not installed; skipping clep.local broadcast.")
        return None

    with _lock:
        if _zc is not None:
            return _zc
        try:
            ip = _get_lan_ip()
            zc = Zeroconf()
            info = ServiceInfo(
                type_="_http._tcp.local.",
                name=f"{hostname.upper()}._http._tcp.local.",
                addresses=[socket.inet_aton(ip)],
                port=port,
                server=f"{hostname}.local.",
            )
            zc.register_service(info)
            _zc = zc
            atexit.register(_unpublish)
            print(f"[mdns] broadcasting {hostname}.local -> {ip}:{port}")
        except Exception as e:
            print(f"[mdns] failed to publish {hostname}.local: {e}")
            _zc = None
    return _zc


def _unpublish():
    global _zc
    if _zc is not None:
        try:
            _zc.close()
        except Exception:
            pass
        _zc = None
