"""mark windsurf as having a conditions view (data only)

Revision ID: f7d3b48e1a92
Revises: e6c2a39d4f81
"""
from alembic import op

revision = "f7d3b48e1a92"
down_revision = "e6c2a39d4f81"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "UPDATE activities "
        "SET config = coalesce(config, '{}'::jsonb) || '{\"conditions_enabled\": true}'::jsonb "
        "WHERE slug = 'windsurf'"
    )


def downgrade():
    op.execute("UPDATE activities SET config = config - 'conditions_enabled' WHERE slug = 'windsurf'")
