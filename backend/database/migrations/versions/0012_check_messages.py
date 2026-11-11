"""Save follow-up questions about a check, with their answers.

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "check_messages",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("check_id", sa.String(length=32), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["check_id"], ["checks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("check_messages", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_check_messages_check_id"), ["check_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("check_messages", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_check_messages_check_id"))
    op.drop_table("check_messages")
