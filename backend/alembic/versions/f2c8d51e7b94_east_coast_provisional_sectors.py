"""East Coast: provisional shore sectors, not yet reviewed

Measured from five map points at the PAssion WaVe @ East Coast launch point: the shoreline runs
at about 75 degrees, so the sea side is about 165 degrees. Four bands of a quarter compass each,
wind blowing FROM. Boundaries go to the more cautious class: 300 and 30 are offshore, and 120 and
210 are cross-shore. reviewed_by stays empty, so the site shows these only when provisional
guidance is switched on (WSK_PROVISIONAL_GUIDANCE=1), and always labelled provisional.

These apply to every activity at the spot (activity_id empty). Which activities use direction at all
is decided by each activity's wind_dependent setting.

Revision ID: f2c8d51e7b94
Revises: d9a4e6f1b283
"""
from alembic import op

revision = "f2c8d51e7b94"
down_revision = "d9a4e6f1b283"
branch_labels = None
depends_on = None

SLUG = "east-coast-parkway-carpark-e5"
NOTE = ("Provisional: shoreline about 75 degrees, measured from five map points at the PAssion WaVe "
        "@ East Coast launch point. Quarter-compass bands. Not reviewed.")
# (from, to, class): wind blowing FROM these bearings, no overlaps
SECTORS = [
    (300, 30, "offshore"),            # runs through north
    (30.001, 120, "cross_shore"),
    (120.001, 209.999, "onshore"),
    (210, 299.999, "cross_shore"),
]


def upgrade():
    for lo, hi, cls in SECTORS:
        op.execute(
            "INSERT INTO spot_wind_sectors (spot_id, activity_id, from_deg, to_deg, direction_class, note) "
            f"SELECT id, NULL, {lo}, {hi}, '{cls}', '{NOTE}' FROM spots WHERE slug = '{SLUG}'"
        )


def downgrade():
    op.execute(
        "DELETE FROM spot_wind_sectors WHERE reviewed_by IS NULL AND note LIKE 'Provisional: shoreline%' "
        f"AND spot_id = (SELECT id FROM spots WHERE slug = '{SLUG}')"
    )
