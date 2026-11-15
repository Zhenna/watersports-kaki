"""East Coast becomes visible on the public site

Applying this is the "go public" switch for the first spot. Until an instructor reviews the
wind ranges, the public sees the facts (wind, lightning, forecast) and the page says that
guidance is awaiting review. The development and production servers share one database, so
apply it when the public API is ready.

Revision ID: d9a4e6f1b283
Revises: c8f1d27a9e55
"""
from alembic import op

revision = "d9a4e6f1b283"
down_revision = "c8f1d27a9e55"
branch_labels = None
depends_on = None

SLUG = "east-coast-parkway-carpark-e5"


def upgrade():
    op.execute(f"UPDATE spots SET is_public = true WHERE slug = '{SLUG}'")


def downgrade():
    op.execute(f"UPDATE spots SET is_public = false WHERE slug = '{SLUG}'")
