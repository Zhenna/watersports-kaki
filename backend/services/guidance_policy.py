"""
When guidance may be shown. No database imports, so this can be tested on its own.

Two independent switches, both read from the environment:
  WSK_SHOW_PRIVATE_SPOTS=1    local testing: also shows non-public spots. Never set on the live server.
  WSK_PROVISIONAL_GUIDANCE=1  show guidance from rules and sectors no instructor has reviewed yet.
                              The page keeps labelling it provisional. Off unless set.
"""
import os

from services.conditions_rules import WindSector


def preview_mode() -> bool:
    """Local testing only: allows non-public spots and unreviewed rules and sectors."""
    return os.getenv("WSK_SHOW_PRIVATE_SPOTS") == "1"


def provisional_guidance() -> bool:
    """Show guidance from unreviewed rules and sectors, labelled provisional. Does not show private spots."""
    return os.getenv("WSK_PROVISIONAL_GUIDANCE") == "1"


def select_sectors(rows, activity_id, allow_unreviewed: bool) -> list:
    """Wind sectors for one activity: those for every activity (activity_id empty) or this one.
    Unreviewed sectors are included only when allow_unreviewed is true."""
    return [
        WindSector(s.from_deg, s.to_deg, s.direction_class)
        for s in rows
        if (s.activity_id is None or s.activity_id == activity_id)
        and (allow_unreviewed or s.reviewed_by)
    ]
