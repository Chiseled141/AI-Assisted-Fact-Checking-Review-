"""claim pie chart

Revision ID: 0021
Revises: 0020
"""

import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("claims", sa.Column("pie_chart", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("claims", "pie_chart")
