"""generic activity layer (expand step, additive only)

Adds: activities, user_activity_profiles, spot_activities, operator_activities,
activity_condition_rules, condition_observations; nullable activity_id on
intents, activity_sessions, checkins, milestones; intents.spot_id;
users.email, users.signup_source, users.phone made nullable.

Old string columns (sport, sports arrays, levels) are intentionally kept.
They are dropped in a later "contract" migration once code stops reading them.

Revision ID: c4a9e17d3b68
Revises: b7d2e5a91c03
"""
import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c4a9e17d3b68"
down_revision = "b7d2e5a91c03"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB
GEN_UUID = sa.text("gen_random_uuid()")

# slug, name, wind_dependent. Slugs are permanent identifiers: never rename them.
ACTIVITIES = [
    ("windsurf",    "Windsurfing",                    True),
    ("sup",         "Stand-Up Paddleboarding (SUP)",  True),
    ("kayak",       "Kayaking",                       True),
    ("kitesurfing", "Kitesurfing",                    True),
    ("foil",        "Foiling (wing, wind or e-foil)", True),
    ("wakesurf",    "Wakesurfing",                    False),
    ("wakeboard",   "Wakeboarding",                   False),
    ("diving",      "Diving",                         False),
]

# Copied from services/verdict.py WIND_RANGES (km/h). never_tried uses beginner limits.
WIND_RULES = {
    "windsurf": {"beginner": (8, 20),  "intermediate": (15, 35), "advanced": (20, 60)},
    "sup":      {"beginner": (0, 12),  "intermediate": (0, 20),  "advanced": (0, 40)},
    "kayak":    {"beginner": (0, 15),  "intermediate": (0, 25),  "advanced": (0, 50)},
}

# Tables that get a nullable activity_id (backfilled from the old sport string).
ACTIVITY_FK_TABLES = ["intents", "activity_sessions", "checkins", "milestones"]


def upgrade():
    # ---- activities -------------------------------------------------------
    op.create_table(
        "activities",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("slug", sa.String(30), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(20), nullable=False, server_default="water"),
        sa.Column("config", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    for slug, name, wind_dependent in ACTIVITIES:
        cfg = json.dumps({"wind_dependent": wind_dependent})
        op.execute(
            f"INSERT INTO activities (slug, name, config) "
            f"VALUES ('{slug}', '{name}', '{cfg}'::jsonb)"
        )

    # ---- per-user, per-activity profile ----------------------------------
    op.create_table(
        "user_activity_profiles",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("activity_id", UUID, sa.ForeignKey("activities.id", ondelete="RESTRICT"),
                  nullable=False),
        # doing | want_to_try
        sa.Column("status", sa.String(20), nullable=False, server_default="doing"),
        # never_tried | beginner | intermediate | advanced
        sa.Column("level", sa.String(20), nullable=True),
        sa.Column("extra", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "activity_id", name="uq_user_activity_profile"),
        sa.CheckConstraint("status in ('doing', 'want_to_try')",
                           name="ck_user_activity_profiles_status"),
    )
    op.create_index("ix_user_activity_profiles_user_id", "user_activity_profiles", ["user_id"])

    # ---- spot / operator <-> activity ------------------------------------
    op.create_table(
        "spot_activities",
        sa.Column("spot_id", UUID, sa.ForeignKey("spots.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("activity_id", UUID, sa.ForeignKey("activities.id", ondelete="CASCADE"),
                  primary_key=True),
    )
    op.create_table(
        "operator_activities",
        sa.Column("operator_id", UUID, sa.ForeignKey("operators.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("activity_id", UUID, sa.ForeignKey("activities.id", ondelete="CASCADE"),
                  primary_key=True),
    )
    op.execute(
        "INSERT INTO spot_activities (spot_id, activity_id) "
        "SELECT s.id, a.id FROM spots s "
        "CROSS JOIN LATERAL unnest(s.sports) AS u(slug) "
        "JOIN activities a ON a.slug = u.slug "
        "WHERE true "
        "ON CONFLICT DO NOTHING"
    )
    op.execute(
        "INSERT INTO operator_activities (operator_id, activity_id) "
        "SELECT o.id, a.id FROM operators o "
        "CROSS JOIN LATERAL unnest(o.sports) AS u(slug) "
        "JOIN activities a ON a.slug = u.slug "
        "WHERE true "
        "ON CONFLICT DO NOTHING"
    )

    # ---- nullable activity_id on existing tables, backfilled -------------
    for t in ACTIVITY_FK_TABLES:
        op.add_column(t, sa.Column("activity_id", UUID, nullable=True))
        op.create_foreign_key(f"fk_{t}_activity_id", t, "activities",
                              ["activity_id"], ["id"], ondelete="RESTRICT")
        op.create_index(f"ix_{t}_activity_id", t, ["activity_id"])
        op.execute(
            f"UPDATE {t} SET activity_id = a.id FROM activities a WHERE a.slug = {t}.sport"
        )

    # ---- intents.spot_id (was free-text spot_name) -----------------------
    op.add_column("intents", sa.Column("spot_id", UUID, nullable=True))
    op.create_foreign_key("fk_intents_spot_id", "intents", "spots",
                          ["spot_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_intents_spot_id", "intents", ["spot_id"])
    op.execute(
        "UPDATE intents SET spot_id = s.id FROM spots s "
        "WHERE lower(s.name) = lower(intents.spot_name)"
    )

    # ---- users: email identity, acquisition surface, phone optional ------
    op.add_column("users", sa.Column("email", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("signup_source", sa.String(30), nullable=True))
    op.alter_column("users", "phone", existing_type=sa.String(20), nullable=True)
    op.create_index("uq_users_email_lower", "users", [sa.text("lower(email)")], unique=True)

    # ---- activity condition rules (seeded from verdict.py) ---------------
    op.create_table(
        "activity_condition_rules",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("activity_id", UUID, sa.ForeignKey("activities.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("condition_type", sa.String(30), nullable=False),
        sa.Column("min_value", sa.Float(), nullable=True),
        sa.Column("max_value", sa.Float(), nullable=True),
        sa.UniqueConstraint("activity_id", "level", "condition_type",
                            name="uq_activity_condition_rule"),
    )
    for slug, by_level in WIND_RULES.items():
        rows = dict(by_level)
        rows["never_tried"] = by_level["beginner"]
        for level, (lo, hi) in rows.items():
            op.execute(
                "INSERT INTO activity_condition_rules "
                "(activity_id, level, condition_type, min_value, max_value) "
                f"SELECT id, '{level}', 'wind_speed_kmh', {lo}, {hi} "
                f"FROM activities WHERE slug = '{slug}'"
            )

    # ---- raw condition observations (append-only history) ----------------
    op.create_table(
        "condition_observations",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("source", sa.String(20), nullable=False, server_default="nea"),
        sa.Column("station_id", sa.String(30), nullable=False),
        # wind_speed_kmh | wind_direction_deg | air_temp_c
        sa.Column("condition_type", sa.String(30), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("source", "station_id", "condition_type", "observed_at",
                            name="uq_condition_observation"),
    )
    op.create_index("ix_condition_observations_lookup", "condition_observations",
                    ["station_id", "condition_type", "observed_at"])


def downgrade():
    op.drop_index("ix_condition_observations_lookup", table_name="condition_observations")
    op.drop_table("condition_observations")
    op.drop_table("activity_condition_rules")

    # Restoring NOT NULL fails if any user was created without a phone.
    op.drop_index("uq_users_email_lower", table_name="users")
    op.alter_column("users", "phone", existing_type=sa.String(20), nullable=False)
    op.drop_column("users", "signup_source")
    op.drop_column("users", "email")

    op.drop_index("ix_intents_spot_id", table_name="intents")
    op.drop_constraint("fk_intents_spot_id", "intents", type_="foreignkey")
    op.drop_column("intents", "spot_id")

    for t in reversed(ACTIVITY_FK_TABLES):
        op.drop_index(f"ix_{t}_activity_id", table_name=t)
        op.drop_constraint(f"fk_{t}_activity_id", t, type_="foreignkey")
        op.drop_column(t, "activity_id")

    op.drop_table("operator_activities")
    op.drop_table("spot_activities")
    op.drop_index("ix_user_activity_profiles_user_id", table_name="user_activity_profiles")
    op.drop_table("user_activity_profiles")
    op.drop_table("activities")
