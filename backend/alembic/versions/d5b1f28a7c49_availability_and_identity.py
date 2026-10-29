"""user availability, acquisition product, auth link (additive)

Revision ID: d5b1f28a7c49
Revises: c4a9e17d3b68
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d5b1f28a7c49"
down_revision = "c4a9e17d3b68"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade():
    # Which brand first acquired the user: watersportskaki | outdoorkaki | web.
    # signup_source (added earlier) stays the channel or campaign code.
    op.add_column("users", sa.Column("acquisition_product", sa.String(30), nullable=True))

    # Optional link to an external auth provider (e.g. Supabase Auth user id).
    # Nullable and unique, so either auth choice stays open.
    op.add_column("users", sa.Column("auth_user_id", UUID, nullable=True))
    op.create_unique_constraint("uq_users_auth_user_id", "users", ["auth_user_id"])

    op.create_table(
        "user_availability",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("weekday", sa.SmallInteger(), nullable=False),
        sa.Column("part_of_day", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "weekday", "part_of_day", name="uq_user_availability"),
        sa.CheckConstraint("weekday between 0 and 6", name="ck_user_availability_weekday"),
        sa.CheckConstraint("part_of_day in ('am', 'pm', 'evening')",
                           name="ck_user_availability_part_of_day"),
    )
    op.create_index("ix_user_availability_slot", "user_availability",
                    ["weekday", "part_of_day"])


def downgrade():
    op.drop_index("ix_user_availability_slot", table_name="user_availability")
    op.drop_table("user_availability")
    op.drop_constraint("uq_users_auth_user_id", "users", type_="unique")
    op.drop_column("users", "auth_user_id")
    op.drop_column("users", "acquisition_product")
