"""Remove the published fact-check lookup.

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("claims", "fact_check")


def downgrade() -> None:
    op.add_column("claims", sa.Column("fact_check", sa.JSON(), nullable=True))
