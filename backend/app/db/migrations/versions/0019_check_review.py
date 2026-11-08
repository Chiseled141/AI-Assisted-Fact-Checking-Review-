"""Save what a check asks the reader before it searches."""

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("checks", sa.Column("review", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("checks", "review")
