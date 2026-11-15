"""user_availability: only AM and PM exist (no evening slots)

The table is empty and not yet used. If it ever held 'evening' rows, this migration fails
loudly instead of deleting them.

Revision ID: c8f1d27a9e55
Revises: b3c7e18d5a40
"""
from alembic import op

revision = "c8f1d27a9e55"
down_revision = "b3c7e18d5a40"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_user_availability_part_of_day", "user_availability", type_="check")
    op.create_check_constraint(
        "ck_user_availability_part_of_day", "user_availability", "part_of_day in ('am', 'pm')"
    )


def downgrade():
    op.drop_constraint("ck_user_availability_part_of_day", "user_availability", type_="check")
    op.create_check_constraint(
        "ck_user_availability_part_of_day", "user_availability", "part_of_day in ('am', 'pm', 'evening')"
    )
