"""Keep the per-check follow-up count after deleting chat messages."""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("checks", sa.Column("cleared_followups", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("checks") as batch_op:
        batch_op.drop_column("cleared_followups")
