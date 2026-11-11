"""Save the source and map view of a traffic incident."""

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("claims", sa.Column("incident_map", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("claims", "incident_map")
