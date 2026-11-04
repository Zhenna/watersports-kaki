"""conditions prototype: spot pages, wind sectors, rule review fields, forecasts, feed log

Additive only.

Revision ID: e6c2a39d4f81
Revises: d5b1f28a7c49
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e6c2a39d4f81"
down_revision = "d5b1f28a7c49"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
GEN_UUID = sa.text("gen_random_uuid()")


def upgrade():
    # ---- spots: public page fields ---------------------------------------
    op.add_column("spots", sa.Column("slug", sa.String(60), nullable=True))
    op.add_column("spots", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("spots", sa.Column("caveats", sa.Text(), nullable=True))
    op.add_column("spots", sa.Column("is_public", sa.Boolean(), nullable=False,
                                     server_default=sa.false()))
    op.execute(
        "UPDATE spots SET slug = trim(both '-' from "
        "lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))"
    )
    op.create_unique_constraint("uq_spots_slug", "spots", ["slug"])

    # ---- instructor-reviewed wind sectors per spot -----------------------
    op.create_table(
        "spot_wind_sectors",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("spot_id", UUID, sa.ForeignKey("spots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("activity_id", UUID, sa.ForeignKey("activities.id", ondelete="CASCADE"),
                  nullable=True),
        # bearing the wind blows FROM, in degrees; the sector runs clockwise and may wrap
        sa.Column("from_deg", sa.Float(), nullable=False),
        sa.Column("to_deg", sa.Float(), nullable=False),
        sa.Column("direction_class", sa.String(20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.String(100), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("from_deg between 0 and 360", name="ck_spot_wind_sectors_from"),
        sa.CheckConstraint("to_deg between 0 and 360", name="ck_spot_wind_sectors_to"),
        sa.CheckConstraint("direction_class in ('onshore', 'cross_shore', 'offshore')",
                           name="ck_spot_wind_sectors_class"),
    )
    op.create_index("ix_spot_wind_sectors_spot_id", "spot_wind_sectors", ["spot_id"])

    # ---- rules: version and review trail ---------------------------------
    op.add_column("activity_condition_rules", sa.Column("rule_version", sa.String(30), nullable=True))
    op.add_column("activity_condition_rules", sa.Column("reviewed_by", sa.String(100), nullable=True))
    op.add_column("activity_condition_rules",
                  sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("activity_condition_rules", sa.Column("source_note", sa.Text(), nullable=True))
    op.execute("UPDATE activity_condition_rules SET rule_version = 'draft-1', "
               "source_note = 'Copied from the original verdict.py ranges. Not instructor reviewed.'")

    # ---- stations (to show proxy distance from spot) ---------------------
    op.create_table(
        "weather_stations",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("source", sa.String(20), nullable=False, server_default="nea"),
        sa.Column("station_id", sa.String(30), nullable=False),
        sa.Column("name", sa.String(100), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.UniqueConstraint("source", "station_id", name="uq_weather_station"),
    )

    # ---- forecasts, stored with issue and valid time for later evaluation -
    op.create_table(
        "condition_forecasts",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("provider_model", sa.String(50), nullable=True),
        sa.Column("spot_id", UUID, sa.ForeignKey("spots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_at", sa.DateTime(timezone=True), nullable=False),
        # wind_speed_kmh | wind_gust_kmh | wind_direction_deg | rain_mm | ...
        sa.Column("condition_type", sa.String(30), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("source", "provider_model", "spot_id", "issued_at", "valid_at",
                            "condition_type", name="uq_condition_forecast"),
    )
    op.create_index("ix_condition_forecasts_spot_valid", "condition_forecasts",
                    ["spot_id", "valid_at"])

    # ---- feed health log -------------------------------------------------
    op.create_table(
        "feed_fetch_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("feed", sa.String(40), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
    )
    op.create_index("ix_feed_fetch_log_lookup", "feed_fetch_log", ["source", "feed", "started_at"])


def downgrade():
    op.drop_index("ix_feed_fetch_log_lookup", table_name="feed_fetch_log")
    op.drop_table("feed_fetch_log")
    op.drop_index("ix_condition_forecasts_spot_valid", table_name="condition_forecasts")
    op.drop_table("condition_forecasts")
    op.drop_table("weather_stations")
    op.drop_column("activity_condition_rules", "source_note")
    op.drop_column("activity_condition_rules", "reviewed_at")
    op.drop_column("activity_condition_rules", "reviewed_by")
    op.drop_column("activity_condition_rules", "rule_version")
    op.drop_index("ix_spot_wind_sectors_spot_id", table_name="spot_wind_sectors")
    op.drop_table("spot_wind_sectors")
    op.drop_constraint("uq_spots_slug", "spots", type_="unique")
    op.drop_column("spots", "is_public")
    op.drop_column("spots", "caveats")
    op.drop_column("spots", "description")
    op.drop_column("spots", "slug")
