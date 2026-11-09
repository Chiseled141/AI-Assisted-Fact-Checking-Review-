"""Store a source-verified comparison with its claim."""

import sqlalchemy as sa
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("claims", sa.Column("bar_chart", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("claims", "bar_chart")
