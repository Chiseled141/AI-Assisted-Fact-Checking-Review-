"""Save public model progress and remove per-source AI analysis.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("checks", sa.Column("progress", sa.JSON(), nullable=True))
    op.drop_column("sources", "analysis")


def downgrade() -> None:
    op.add_column("sources", sa.Column("analysis", sa.JSON(), nullable=True))
    op.drop_column("checks", "progress")
