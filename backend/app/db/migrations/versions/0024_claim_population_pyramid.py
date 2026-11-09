"""Store the population pyramid with its claim."""

import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("claims", sa.Column("population_pyramid", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("claims", "population_pyramid")
