"""Keep a verdict's explanation in other languages when the model wrote one."""

import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("verdicts", sa.Column("translations", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("verdicts", "translations")
