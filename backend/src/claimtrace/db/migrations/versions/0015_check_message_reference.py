"""Keep the context attached to a follow-up message."""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("check_messages", sa.Column("reference", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("check_messages") as batch_op:
        batch_op.drop_column("reference")
