"""Keep a claim in other languages when the extraction model wrote one."""

import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("claims", sa.Column("translations", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("claims", "translations")
