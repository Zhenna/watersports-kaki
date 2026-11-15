"""Launch points: where a shore sport launches, with the shoreline there

A launch point belongs to a spot and, optionally, to one activity. It records the place people
launch from, and the shoreline measured there. The first row is the PAssion WaVe @ East Coast
launch point for windsurfing at the East Coast spot. The shoreline runs at about 75 degrees (give or
take about 5), measured from five map points about 289 m apart, so the sea side is about 165 degrees.
This is a landmark for where the measurement was taken, not a partnership. reviewed_by stays empty,
so the API sends it only while provisional guidance is on, and the page labels it draft.

Additive only. The downgrade drops the table.

Revision ID: b3e7f90a2d54
Revises: f2c8d51e7b94
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b3e7f90a2d54"
down_revision = "f2c8d51e7b94"
branch_labels = None
depends_on = None

SPOT_SLUG = "east-coast-parkway-carpark-e5"
ACTIVITY_SLUG = "windsurf"
NAME = "PAssion WaVe @ East Coast launch"
NOTE = ("Provisional: shoreline about 75 degrees (give or take about 5), measured from five map "
        "points about 289 m apart at the PAssion WaVe @ East Coast launch point. Not reviewed.")


def upgrade():
    op.create_table(
        "spot_launch_points",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("spot_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("spots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("activity_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("lat", sa.Float, nullable=False),
        sa.Column("lng", sa.Float, nullable=False),
        sa.Column("shore_bearing_deg", sa.Float, nullable=False),
        sa.Column("sea_bearing_deg", sa.Float, nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("reviewed_by", sa.String(100), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("shore_bearing_deg between 0 and 360", name="ck_spot_launch_points_shore"),
        sa.CheckConstraint("sea_bearing_deg between 0 and 360", name="ck_spot_launch_points_sea"),
        sa.CheckConstraint("lat between -90 and 90 and lng between -180 and 180",
                           name="ck_spot_launch_points_coords"),
    )
    op.create_index("ix_spot_launch_points_spot_id", "spot_launch_points", ["spot_id"])

    # Inserts nothing if the spot or the activity is missing, instead of failing.
    op.execute(
        sa.text(
            "INSERT INTO spot_launch_points "
            "(spot_id, activity_id, name, lat, lng, shore_bearing_deg, sea_bearing_deg, note) "
            "SELECT s.id, a.id, :name, :lat, :lng, :shore, :sea, :note "
            "FROM spots s JOIN activities a ON a.slug = :activity "
            "WHERE s.slug = :spot"
        ).bindparams(name=NAME, lat=1.311285, lng=103.952722, shore=75.0, sea=165.0, note=NOTE,
                     activity=ACTIVITY_SLUG, spot=SPOT_SLUG)
    )


def downgrade():
    op.drop_index("ix_spot_launch_points_spot_id", table_name="spot_launch_points")
    op.drop_table("spot_launch_points")
