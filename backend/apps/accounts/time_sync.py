"""
Trusted wall-clock time, independent of the host's system clock.

TOTP is the one place in this project where our clock has to agree with a
clock we do not control (the user's authenticator app). Everything else —
JWT expiry, OTP expiry, session TTLs — is issued and validated by this same
process, so a skewed system clock stays internally consistent and nobody
notices. TOTP does not have that luxury: a host drifting more than one
30-second step makes *every* code look invalid.

Correcting the host clock needs root, which the app does not have, so instead
we measure how wrong the clock is and carry that offset ourselves. The offset
is learned over SNTP (falling back to the ``Date`` header of an HTTPS
response), shared between workers through the cache, and refreshed
periodically.

Nothing here raises: if the network is unavailable the last known offset is
reused, and if there has never been one we fall back to the raw system clock,
which is exactly the behaviour this module replaced.
"""

from __future__ import annotations

import email.utils
import socket
import struct
import threading
import time
import urllib.request

from django.conf import settings

from .safety import safe_cache_get, safe_cache_set

# Seconds between the NTP epoch (1900-01-01) and the Unix epoch (1970-01-01).
_NTP_EPOCH_DELTA = 2_208_988_800
_NTP_PORT = 123
_NTP_PACKET_SIZE = 48

_CACHE_KEY = "time_sync:clock_offset"

# Guards the refresh so a burst of logins triggers one network round trip
# rather than one per request.
_refresh_lock = threading.Lock()

# Process-local view of the offset. `checked_at` and `failed_at` are monotonic
# timestamps: the wall clock is the very thing we distrust, and it may be
# stepped underneath us if someone fixes the host while we are running.
_state: dict[str, float | None] = {
    "offset": None,
    "checked_at": None,
    "failed_at": None,
}


def _setting(name: str, default):
    return getattr(settings, name, default)


def _enabled() -> bool:
    return bool(_setting("TIME_SYNC_ENABLED", True))


def _servers() -> list[str]:
    return list(
        _setting(
            "TIME_SYNC_NTP_SERVERS",
            ["pool.ntp.org", "time.cloudflare.com", "time.google.com"],
        )
    )


def _http_fallback_urls() -> list[str]:
    return list(_setting("TIME_SYNC_HTTP_URLS", ["https://www.cloudflare.com"]))


def _timeout() -> float:
    return float(_setting("TIME_SYNC_TIMEOUT", 2.0))


def _refresh_interval() -> float:
    return float(_setting("TIME_SYNC_REFRESH_SECONDS", 900))


def _retry_interval() -> float:
    """How long to coast on the last known offset after a failed refresh."""
    return float(_setting("TIME_SYNC_RETRY_SECONDS", 60))


def _max_offset() -> float:
    """Reject implausible corrections rather than trust a hostile time source."""
    return float(_setting("TIME_SYNC_MAX_OFFSET_SECONDS", 86_400))


def _ntp_timestamp_to_unix(seconds: int, fraction: int) -> float:
    return (seconds - _NTP_EPOCH_DELTA) + (fraction / 2**32)


def _query_ntp(server: str, timeout: float) -> float:
    """
    Return `true_time - system_time` measured against one NTP server.

    Uses the standard four-timestamp calculation so the round-trip delay
    cancels out instead of being charged entirely to the offset.
    """
    request = bytearray(_NTP_PACKET_SIZE)
    request[0] = 0x1B  # LI = 0, VN = 3, Mode = 3 (client)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        originate = time.time()
        sock.sendto(bytes(request), (server, _NTP_PORT))
        payload, _ = sock.recvfrom(_NTP_PACKET_SIZE)
        destination = time.time()
    finally:
        sock.close()

    if len(payload) < _NTP_PACKET_SIZE:
        raise ValueError(f"short NTP reply ({len(payload)} bytes)")

    leap = payload[0] >> 6
    mode = payload[0] & 0b111
    stratum = payload[1]
    if mode != 4:
        raise ValueError(f"unexpected NTP mode {mode}")
    if leap == 3:
        raise ValueError("server reports an unsynchronised clock")
    if stratum == 0 or stratum > 15:
        # Stratum 0 is a kiss-of-death packet, not a time source.
        raise ValueError(f"unusable stratum {stratum}")

    fields = struct.unpack("!12I", payload[:_NTP_PACKET_SIZE])
    receive = _ntp_timestamp_to_unix(fields[8], fields[9])
    transmit = _ntp_timestamp_to_unix(fields[10], fields[11])
    if transmit <= 0:
        raise ValueError("empty transmit timestamp")

    return ((receive - originate) + (transmit - destination)) / 2.0


def _query_http(url: str, timeout: float) -> float:
    """
    Offset from an HTTPS `Date` header.

    Only one-second granularity, which is far short of NTP but ample against a
    30-second TOTP step. This exists for networks that allow 443 but block
    UDP 123.
    """
    request = urllib.request.Request(url, method="HEAD")
    sent = time.time()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        received = time.time()
        header = response.headers.get("Date")

    if not header:
        raise ValueError("response carried no Date header")

    parsed = email.utils.parsedate_to_datetime(header)
    return parsed.timestamp() - ((sent + received) / 2.0)


def _measure_offset() -> float | None:
    """Try every configured source in order, returning the first plausible offset."""
    timeout = _timeout()
    limit = _max_offset()

    for server in _servers():
        try:
            offset = _query_ntp(server, timeout)
        except Exception:
            continue
        if abs(offset) > limit:
            continue
        return offset

    for url in _http_fallback_urls():
        try:
            offset = _query_http(url, timeout)
        except Exception:
            continue
        if abs(offset) > limit:
            continue
        return offset

    return None


def _adopt(offset: float, now: float) -> None:
    _state["offset"] = offset
    _state["checked_at"] = now
    _state["failed_at"] = None


def _refresh(now: float) -> None:
    """Populate the offset from the shared cache, or measure it fresh."""
    # Another worker may have refreshed since we started waiting on the lock.
    cached = safe_cache_get(_CACHE_KEY)
    if isinstance(cached, (int, float)):
        _adopt(float(cached), now)
        return

    last_failure = _state["failed_at"]
    if last_failure is not None and (now - last_failure) < _retry_interval():
        # Coast on whatever we have rather than paying the timeout per request.
        return

    offset = _measure_offset()
    if offset is None:
        _state["failed_at"] = now
        return

    _adopt(offset, now)
    # The cache TTL is what paces refreshes across workers: once it expires,
    # whichever worker notices first re-measures and republishes.
    safe_cache_set(_CACHE_KEY, offset, timeout=int(_refresh_interval()))


def get_clock_offset() -> float:
    """Seconds to add to `time.time()` to obtain true time. Never raises."""
    if not _enabled():
        return 0.0

    now = time.monotonic()
    checked_at = _state["checked_at"]
    if checked_at is not None and (now - checked_at) < _refresh_interval():
        return _state["offset"] or 0.0

    try:
        with _refresh_lock:
            # Re-check: the thread that held the lock may have just refreshed.
            checked_at = _state["checked_at"]
            if checked_at is None or (now - checked_at) >= _refresh_interval():
                _refresh(now)
    except Exception:
        pass

    return _state["offset"] or 0.0


def trusted_time() -> float:
    """`time.time()` corrected by the measured offset."""
    return time.time() + get_clock_offset()
