"""create stream tables

Revision ID: 20260505_0001
Revises:
Create Date: 2026-05-05
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260505_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stream_sessions",
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("frame_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "roi_observations",
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("frame_number", sa.Integer(), nullable=False),
        sa.Column("timestamp_ms", sa.Integer(), nullable=False),
        sa.Column("x", sa.Integer(), nullable=False),
        sa.Column("y", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column("detector", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["stream_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_roi_observations_frame_number"),
        "roi_observations",
        ["frame_number"],
        unique=False,
    )
    op.create_index(
        op.f("ix_roi_observations_session_id"),
        "roi_observations",
        ["session_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_roi_observations_session_id"), table_name="roi_observations")
    op.drop_index(op.f("ix_roi_observations_frame_number"), table_name="roi_observations")
    op.drop_table("roi_observations")
    op.drop_table("stream_sessions")

