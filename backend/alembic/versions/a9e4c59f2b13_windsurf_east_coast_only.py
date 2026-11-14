"""windsurf is supported at East Coast only (data correction)

Removes windsurf from every other spot, in both spot_activities and the legacy
spots.sports array, so the two stay consistent.

Revision ID: a9e4c59f2b13
Revises: f7d3b48e1a92
"""
from alembic import op

revision = "a9e4c59f2b13"
down_revision = "f7d3b48e1a92"
branch_labels = None
depends_on = None

KEEP = "east-coast-parkway-carpark-e5"
RESTORE = ("marina-barrage", "sembawang-park")  # the links this migration removed


def upgrade():
    op.execute(
        "DELETE FROM spot_activities sa "
        "USING activities a, spots s "
        "WHERE sa.activity_id = a.id AND sa.spot_id = s.id "
        f"AND a.slug = 'windsurf' AND s.slug <> '{KEEP}'"
    )
    op.execute(
        "UPDATE spots SET sports = array_remove(sports, 'windsurf') "
        f"WHERE slug <> '{KEEP}'"
    )


def downgrade():
    slugs = ", ".join(f"'{s}'" for s in RESTORE)
    op.execute(
        "INSERT INTO spot_activities (spot_id, activity_id) "
        "SELECT s.id, a.id FROM spots s CROSS JOIN activities a "
        f"WHERE a.slug = 'windsurf' AND s.slug IN ({slugs}) "
        "ON CONFLICT DO NOTHING"
    )
    op.execute(
        "UPDATE spots SET sports = array_append(sports, 'windsurf') "
        f"WHERE slug IN ({slugs}) AND NOT ('windsurf' = ANY(sports))"
    )
