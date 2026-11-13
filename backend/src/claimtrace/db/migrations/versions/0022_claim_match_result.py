"""Store the verified match result with its claim."""

import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("claims", sa.Column("match_result", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("claims", "match_result")
