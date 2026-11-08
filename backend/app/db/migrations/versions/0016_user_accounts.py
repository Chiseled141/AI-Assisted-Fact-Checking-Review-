"""User accounts, signed-in sessions, and an owner for each check.

Checks saved before this have no owner. They are kept, unchanged, and hidden until
`python -m app.db.transfer claim USERNAME` gives them one.
"""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("username"),
    )
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    with op.batch_alter_table("checks") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.String(32), nullable=True))
        batch_op.create_foreign_key("fk_checks_user_id_users", "users", ["user_id"], ["id"])
        batch_op.create_index("ix_checks_user_id", ["user_id"])


def downgrade() -> None:
    with op.batch_alter_table("checks") as batch_op:
        batch_op.drop_index("ix_checks_user_id")
        batch_op.drop_constraint("fk_checks_user_id_users", type_="foreignkey")
        batch_op.drop_column("user_id")
    op.drop_index("ix_user_sessions_user_id", "user_sessions")
    op.drop_table("user_sessions")
    op.drop_table("users")
