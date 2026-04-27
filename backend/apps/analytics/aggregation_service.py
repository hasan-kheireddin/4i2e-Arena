# This module re-exports everything from aggregration_service
# (the canonical implementation with a typo in its filename).
# Both names are now usable as imports throughout the codebase.
from .aggregration_service import (  # noqa: F401
    get_activity_heatmap,
    get_activity_timeline,
    get_recent_activity,
    get_user_activity_summary,
    invalidate_user_activity_cache,
)
