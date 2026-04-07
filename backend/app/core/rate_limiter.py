"""
rate_limiter.py — In-memory brute-force protection for login endpoints.

Tracks failed login attempts per identifier (IP or username).
After MAX_LOGIN_ATTEMPTS failures within LOCKOUT_MINUTES, further
attempts are blocked with HTTP 429.

Note: In-memory dict resets on server restart. For multi-instance
deployments, swap with Redis / ElastiCache.
"""
import time
from collections import defaultdict
from typing import Tuple

from fastapi import HTTPException, status, Request
from app.config import settings


class _AttemptTracker:
    """Tracks failed attempts per key (IP or username)."""

    def __init__(self):
        # key → list of timestamps of failed attempts
        self._attempts: dict[str, list[float]] = defaultdict(list)

    def record_failure(self, key: str) -> None:
        now = time.time()
        self._attempts[key].append(now)
        # Prune old entries beyond the lockout window
        cutoff = now - (settings.LOCKOUT_MINUTES * 60)
        self._attempts[key] = [
            t for t in self._attempts[key] if t > cutoff
        ]

    def record_success(self, key: str) -> None:
        """Clear attempts on successful login."""
        self._attempts.pop(key, None)

    def is_locked(self, key: str) -> Tuple[bool, int]:
        """
        Returns (is_locked, seconds_remaining).
        """
        now = time.time()
        cutoff = now - (settings.LOCKOUT_MINUTES * 60)
        recent = [t for t in self._attempts.get(key, []) if t > cutoff]
        self._attempts[key] = recent

        if len(recent) >= settings.MAX_LOGIN_ATTEMPTS:
            oldest = min(recent)
            unlock_at = oldest + (settings.LOCKOUT_MINUTES * 60)
            remaining = int(unlock_at - now)
            return True, max(remaining, 0)

        return False, 0

    @property
    def remaining_attempts(self) -> dict:
        """For debugging — not exposed in API."""
        return dict(self._attempts)


# Singleton instance
_tracker = _AttemptTracker()


def check_rate_limit(request: Request, username: str) -> None:
    """
    Call BEFORE login validation. Raises 429 if locked out.
    Checks both IP and username independently.
    """
    client_ip = request.client.host if request.client else "unknown"
    ip_key = f"ip:{client_ip}"
    user_key = f"user:{username.lower()}"

    for key in [ip_key, user_key]:
        locked, remaining = _tracker.is_locked(key)
        if locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Too many failed login attempts. "
                    f"Account locked for {remaining // 60} min {remaining % 60} sec. "
                    f"Try again later."
                ),
            )


def record_login_failure(request: Request, username: str) -> None:
    """Call AFTER a failed login attempt."""
    client_ip = request.client.host if request.client else "unknown"
    _tracker.record_failure(f"ip:{client_ip}")
    _tracker.record_failure(f"user:{username.lower()}")


def record_login_success(request: Request, username: str) -> None:
    """Call AFTER a successful login — clears lockout counters."""
    client_ip = request.client.host if request.client else "unknown"
    _tracker.record_success(f"ip:{client_ip}")
    _tracker.record_success(f"user:{username.lower()}")
