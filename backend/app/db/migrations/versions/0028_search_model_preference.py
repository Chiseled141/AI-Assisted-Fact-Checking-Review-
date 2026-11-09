"""Save the search model preference and snapshot it on new checks."""

import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("preferred_search_model_id", sa.String(64), nullable=True))
    op.add_column("checks", sa.Column("search_model", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("checks", "search_model")
    op.drop_column("users", "preferred_search_model_id")
