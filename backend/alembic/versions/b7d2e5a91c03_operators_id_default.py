"""give operators.id a database-side default

Revision ID: b7d2e5a91c03
Revises: a1f3c9d27b54
"""
from alembic import op
import sqlalchemy as sa

revision = "b7d2e5a91c03"
down_revision = "a1f3c9d27b54"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("operators", "id", server_default=sa.text("gen_random_uuid()"))


def downgrade():
    op.alter_column("operators", "id", server_default=None)
