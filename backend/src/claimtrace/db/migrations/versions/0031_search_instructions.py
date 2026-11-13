"""Save the reader's search note and search limits, and snapshot them on new checks."""

import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("users", "checks"):
        op.add_column(table, sa.Column("search_instructions", sa.Text(), nullable=True))
        op.add_column(table, sa.Column("search_options", sa.JSON(), nullable=True))


def downgrade() -> None:
    for table in ("checks", "users"):
        op.drop_column(table, "search_options")
        op.drop_column(table, "search_instructions")
