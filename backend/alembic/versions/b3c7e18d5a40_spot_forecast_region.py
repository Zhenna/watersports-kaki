"""spots.forecast_region: which NEA region's weather text applies to a spot

Revision ID: b3c7e18d5a40
Revises: a9e4c59f2b13
"""
from alembic import op
import sqlalchemy as sa

revision = "b3c7e18d5a40"
down_revision = "a9e4c59f2b13"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spots", sa.Column("forecast_region", sa.String(20), nullable=True))
    op.create_check_constraint(
        "ck_spots_forecast_region", "spots",
        "forecast_region IS NULL OR forecast_region IN ('north', 'south', 'east', 'west', 'central')",
    )
    # East Coast is in NEA's east region. Other spots stay empty until they are reviewed.
    op.execute("UPDATE spots SET forecast_region = 'east' WHERE slug = 'east-coast-parkway-carpark-e5'")


def downgrade():
    op.drop_constraint("ck_spots_forecast_region", "spots", type_="check")
    op.drop_column("spots", "forecast_region")
