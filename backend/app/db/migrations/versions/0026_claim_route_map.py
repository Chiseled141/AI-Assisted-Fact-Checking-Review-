"""Store the verified stops of a claim's route."""

import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("claims", sa.Column("route_map", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("claims", "route_map")
