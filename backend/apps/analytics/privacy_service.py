from __future__ import annotations
import csv
import io
import json
import logging
from typing import Any
from uuid import UUID
from django.utils import timezone
from apps.analytics.models import ActivityEvent, EventCategory

logger = logging.getLogger("analytics.privacy")


def anonymise_user_events(user_id: UUID | int) -> int:
    """
    Anonymise all activity events for a user.

    Scrubs ``metadata``, ``ip_address``, and ``user_agent`` fields while
    preserving the aggregate row (category, event_type, created_at) for
    platform-wide analytics.

    Returns the number of events anonymised.
    """
    count = ActivityEvent.objects.filter(
        user_id=user_id,
        is_anonymised=False,
    ).update(
        metadata={},
        ip_address=None,
        user_agent="",
        is_anonymised=True,
    )

    logger.info(
        "Anonymised %d activity events for user %s",
        count, user_id,
    )
    return count


def delete_user_events(user_id: UUID | int) -> int:
    """
    Hard-delete all activity events for a user.

    Use when the user requests complete data erasure ("right to be
    forgotten").

    Returns the number of events deleted.
    """
    count, _ = ActivityEvent.objects.filter(user_id=user_id).delete()

    logger.info(
        "Deleted %d activity events for user %s",
        count, user_id,
    )
    return count


def export_user_events(user_id: UUID | int) -> list[dict[str, Any]]:
    """
    Export all activity events for a user as a list of dicts (JSON-ready).
    """
    events = (
        ActivityEvent.objects
        .filter(user_id=user_id)
        .order_by("created_at")
        .values(
            "id",
            "category",
            "event_type",
            "metadata",
            "ip_address",
            "user_agent",
            "is_anonymised",
            "created_at",
        )
    )

    return [
        {
            "id": str(e["id"]),
            "category": e["category"],
            "event_type": e["event_type"],
            "metadata": e["metadata"],
            "ip_address": e["ip_address"],
            "user_agent": e["user_agent"],
            "is_anonymised": e["is_anonymised"],
            "created_at": e["created_at"].isoformat(),
        }
        for e in events
    ]


def export_user_events_csv(user_id: UUID | int) -> str:
    """
    Export all activity events for a user as a UTF-8 CSV string.

    Columns: id, category, event_type, metadata (JSON), ip_address,
             user_agent, is_anonymised, created_at
    """
    rows = export_user_events(user_id)
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "id", "category", "event_type", "metadata",
            "ip_address", "user_agent", "is_anonymised", "created_at",
        ],
        extrasaction="ignore",
    )
    writer.writeheader()
    for row in rows:
        row["metadata"] = json.dumps(row["metadata"])
        writer.writerow(row)
    return output.getvalue()


# ---------------------------------------------------------------------------
# Import helpers
# ---------------------------------------------------------------------------

_VALID_CATEGORIES = {c.value for c in EventCategory}


def _validate_event_row(row: dict[str, Any], index: int) -> str | None:
    """
    Validate a single event dict from an import payload.
    Returns an error string or None if valid.
    """
    category = row.get("category", "")
    if category not in _VALID_CATEGORIES:
        return f"Row {index}: invalid category '{category}'"

    event_type = row.get("event_type", "")
    if not isinstance(event_type, str) or not event_type.strip():
        return f"Row {index}: event_type is required"

    metadata = row.get("metadata", {})
    if not isinstance(metadata, dict):
        return f"Row {index}: metadata must be an object"

    return None


def import_user_events(
    user_id: UUID | int,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Import a list of activity event dicts for the given user.

    - Skips any event whose ``id`` already exists in the DB (idempotent).
    - Ignores ``id`` values from the payload if they conflict with another
      user's events (security: you can only import into your own account).
    - Returns a summary dict: imported, skipped, errors.
    """
    imported = 0
    skipped = 0
    errors: list[str] = []

    for index, row in enumerate(rows):
        error = _validate_event_row(row, index)
        if error:
            errors.append(error)
            skipped += 1
            continue

        # Honour the original ID if provided (portability / round-trip),
        # but only if it doesn't already belong to a different user.
        original_id = row.get("id")
        if original_id:
            existing = ActivityEvent.objects.filter(id=original_id).first()
            if existing is not None:
                if str(existing.user_id) != str(user_id):
                    errors.append(
                        f"Row {index}: id '{original_id}' belongs to another user"
                    )
                skipped += 1
                continue

        metadata = row.get("metadata", {})
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError:
                metadata = {}

        kwargs: dict[str, Any] = {
            "user_id": user_id,
            "category": row["category"],
            "event_type": row["event_type"].strip(),
            "metadata": metadata if isinstance(metadata, dict) else {},
            "ip_address": row.get("ip_address") or None,
            "user_agent": row.get("user_agent") or "",
            "is_anonymised": bool(row.get("is_anonymised", False)),
        }
        if original_id:
            kwargs["id"] = original_id

        created_at = row.get("created_at")
        if created_at:
            from django.utils.dateparse import parse_datetime
            parsed = parse_datetime(created_at)
            if parsed:
                kwargs["created_at"] = parsed

        ActivityEvent.objects.create(**kwargs)
        imported += 1

    logger.info(
        "Import for user %s: imported=%d skipped=%d errors=%d",
        user_id, imported, skipped, len(errors),
    )
    return {"imported": imported, "skipped": skipped, "errors": errors}


def parse_import_file(
    content: bytes,
    content_type: str,
) -> tuple[list[dict[str, Any]], str | None]:
    """
    Parse raw file bytes into a list of event dicts.

    Supports:
      - JSON: ``[{...}, ...]`` or ``{"events": [{...}, ...]}``
      - CSV:  header row + data rows

    Returns (rows, error_message).  error_message is None on success.
    """
    ct = content_type.lower()

    # ---- CSV ----------------------------------------------------------------
    # Check CSV first since some browsers send various content types for CSV files
    # Common CSV content types: text/csv, application/vnd.ms-excel, text/plain
    if "csv" in ct or "excel" in ct or ct == "text/plain":
        try:
            text = content.decode("utf-8-sig")  # strip BOM if present
            reader = csv.DictReader(io.StringIO(text))
            rows = []
            for row in reader:
                meta = row.get("metadata", "{}")
                try:
                    row["metadata"] = json.loads(meta) if meta else {}
                except json.JSONDecodeError:
                    row["metadata"] = {}
                row["is_anonymised"] = row.get("is_anonymised", "false").lower() in (
                    "true", "1", "yes"
                )
                rows.append(row)
            return rows, None
        except Exception as exc:
            return [], f"Invalid CSV: {exc}"

    # ---- JSON ---------------------------------------------------------------
    if "json" in ct or ct == "application/octet-stream" or not ct:
        try:
            payload = json.loads(content.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            return [], f"Invalid JSON: {exc}"
        if isinstance(payload, list):
            return payload, None
        if isinstance(payload, dict) and "events" in payload:
            return payload["events"], None
        return [], "JSON must be a list or {\"events\": [...]}"

    return [], f"Unsupported content type: {content_type}"
