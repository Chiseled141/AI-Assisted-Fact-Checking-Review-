"""Save related fact-check suggestions for inputs without claims."""

import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("checks", sa.Column("input_suggestions", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("checks", "input_suggestions")
