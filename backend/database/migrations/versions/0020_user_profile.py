"""Store the avatar and source-language preference for each account."""

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("preferred_source_language", sa.String(2), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferred_source_language")
    op.drop_column("users", "avatar")
