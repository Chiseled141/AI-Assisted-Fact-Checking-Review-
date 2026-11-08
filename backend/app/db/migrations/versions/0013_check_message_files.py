"""Keep the text files a reader attached to a follow-up question.

Revision ID: 0013
Revises: 0012
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("check_messages", schema=None) as batch_op:
        batch_op.add_column(sa.Column("files", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("check_messages", schema=None) as batch_op:
        batch_op.drop_column("files")
