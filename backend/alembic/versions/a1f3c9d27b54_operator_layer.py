"""operator layer: operators table, operator-hosted sessions, booking tracking

Revision ID: a1f3c9d27b54
Revises: 4c6ee34a9b8f
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a1f3c9d27b54"
down_revision = "4c6ee34a9b8f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "operators",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("sports", postgresql.ARRAY(sa.String(30)), nullable=False,
                  server_default=sa.text("'{}'")),
        sa.Column("contact_name", sa.String(100), nullable=True),
        sa.Column("contact_email", sa.String(200), nullable=True),
        sa.Column("website", sa.String(300), nullable=True),
        sa.Column("fee_model", sa.String(20), nullable=True),
        sa.Column("fee_value", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.add_column("activity_sessions",
                  sa.Column("operator_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_activity_sessions_operator_id", "activity_sessions",
                          "operators", ["operator_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_activity_sessions_operator_id", "activity_sessions", ["operator_id"])
    op.add_column("activity_sessions", sa.Column("price_sgd", sa.Numeric(10, 2), nullable=True))
    op.add_column("activity_sessions", sa.Column("capacity", sa.Integer(), nullable=True))
    op.add_column("activity_sessions", sa.Column("booking_url", sa.String(500), nullable=True))
    op.add_column("activity_sessions",
                  sa.Column("referral_fee_sgd", sa.Numeric(10, 2), nullable=True))
    op.add_column("activity_sessions", sa.Column("fee_status", sa.String(20), nullable=True))

    op.add_column("session_members",
                  sa.Column("booked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("session_members", "booked_at")
    op.drop_column("activity_sessions", "fee_status")
    op.drop_column("activity_sessions", "referral_fee_sgd")
    op.drop_column("activity_sessions", "booking_url")
    op.drop_column("activity_sessions", "capacity")
    op.drop_column("activity_sessions", "price_sgd")
    op.drop_index("ix_activity_sessions_operator_id", table_name="activity_sessions")
    op.drop_constraint("fk_activity_sessions_operator_id", "activity_sessions",
                       type_="foreignkey")
    op.drop_column("activity_sessions", "operator_id")
    op.drop_table("operators")
