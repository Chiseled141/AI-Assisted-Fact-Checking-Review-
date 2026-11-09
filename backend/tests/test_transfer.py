"""Copying an old SQLite database, from before accounts, into a new one without losing any history."""

import pytest
from alembic import command
from sqlalchemy import create_engine, select, text

from app.db import models
from app.db.migrate import alembic_config
from app.db.transfer import TransferError, copy_database, main


def old_database(path):
    """A SQLite file at migration 0015, the last one before accounts, holding one finished check."""
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as connection:
        config = alembic_config()
        config.attributes["connection"] = connection
        command.upgrade(config, "0015")
        connection.execute(text(
            "INSERT INTO checks (id, title, input_type, input_text, status, judge_ids, progress, cleared_followups, created_at, updated_at, completed_at)"
            " VALUES ('chk_old', 'Old check', 'text', 'Bản tin cũ', 'completed', '[\"a\", \"b\"]', '[{\"id\": \"x\"}]', 2,"
            " '2026-10-01 08:00:00.000000', '2026-10-01 08:01:00.000000', '2026-10-01 08:01:00.000000')"
        ))
        connection.execute(text(
            "INSERT INTO sources (id, check_id, url, title, text, retrieved_at)"
            " VALUES ('src_old', 'chk_old', 'https://reuters.com/a', 'A', 'Text', '2026-10-01 08:00:30.000000')"
        ))
        connection.execute(text(
            "INSERT INTO claims (id, check_id, position, text, status, price_chart)"
            " VALUES ('clm_old', 'chk_old', 0, 'The line opened.', 'assessed', '{\"prices\": [[1, 2]]}')"
        ))
        connection.execute(text(
            "INSERT INTO evidence (id, claim_id, source_id, position, excerpt, relation)"
            " VALUES ('evd_old', 'clm_old', 'src_old', 0, 'It opened.', 'supporting')"
        ))
        for version, kind in ((1, "ai_assessment"), (2, "human_correction")):
            connection.execute(text(
                "INSERT INTO verdicts (id, claim_id, version, kind, label, explanation, evidence_ids, author, created_at)"
                f" VALUES ('ver_{version}', 'clm_old', {version}, '{kind}', 'supported', 'Why.', '[\"evd_old\"]', 'Reviewer',"
                " '2026-10-01 08:01:00.000000')"
            ))
        connection.execute(text(
            "INSERT INTO check_messages (id, check_id, question, answer, created_at)"
            " VALUES ('msg_old', 'chk_old', 'Why?', 'Because.', '2026-10-01 09:00:00.000000')"
        ))
        connection.execute(text(
            "INSERT INTO feedback (id, check_id, helpful, created_at) VALUES ('fbk_old', 'chk_old', 1, '2026-10-01 09:00:00.000000')"
        ))
    return engine


def new_database(path):
    return create_engine(f"sqlite:///{path}")


def test_everything_is_copied_and_the_old_file_is_left_alone(tmp_path):
    source, target = old_database(tmp_path / "old.db"), new_database(tmp_path / "new.db")
    counts = copy_database(source, target)
    assert counts == {"checks": 1, "sources": 1, "claims": 1, "check_messages": 1, "evidence": 1, "feedback": 1, "verdicts": 2}
    with target.connect() as connection:
        check = connection.execute(select(models.Check)).one()
        assert check.user_id is None  # Nobody owns it until someone claims it.
        assert check.judge_ids == ["a", "b"] and check.progress == [{"id": "x"}] and check.cleared_followups == 2
        assert check.input_text == "Bản tin cũ"
        assert check.input_suggestions is None
        assert check.search_model is None
        assert connection.scalar(select(models.Claim.price_chart)) == {"prices": [[1, 2]]}
        assert connection.scalar(select(models.Claim.pie_chart)) is None
        assert connection.scalar(select(models.Claim.match_result)) is None
        assert connection.scalar(select(models.Claim.stock_heatmap_markets)) is None
        assert connection.scalar(select(models.Claim.bar_chart)) is None
        assert connection.scalar(select(models.Claim.route_map)) is None
        assert connection.scalars(select(models.Verdict.kind).order_by(models.Verdict.version)).all() == [
            "ai_assessment", "human_correction"
        ]
        assert connection.scalar(select(models.Feedback.helpful)) is True
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0028"
    with source.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0015"
        assert "users" not in {row[0] for row in connection.execute(text("SELECT name FROM sqlite_master"))}


def test_copying_twice_or_into_a_used_database_is_refused_and_saves_nothing(tmp_path):
    source, target = old_database(tmp_path / "old.db"), new_database(tmp_path / "new.db")
    copy_database(source, target)
    with pytest.raises(TransferError, match="already has rows"):
        copy_database(source, target)
    with target.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM checks")) == 1


def test_an_unknown_owner_rolls_the_whole_copy_back(tmp_path):
    source, target = old_database(tmp_path / "old.db"), new_database(tmp_path / "new.db")
    with pytest.raises(TransferError, match="no user"):
        copy_database(source, target, owner="lan")
    with target.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM checks")) == 0


def test_the_command_line_copies_to_an_owner_who_already_signed_up(tmp_path, capsys):
    old_database(tmp_path / "old.db")
    target = new_database(tmp_path / "new.db")
    from app.db.migrate import run_migrations

    run_migrations(target)
    with target.begin() as connection:
        connection.execute(models.User.__table__.insert().values(
            id="usr_lan", username="lan", password_hash="x", created_at=models.utcnow()
        ))
    code = main(["copy", "--from", f"sqlite:///{tmp_path}/old.db", "--to", f"sqlite:///{tmp_path}/new.db", "--owner", "Lan"])
    assert code == 0
    assert "checks: 1" in capsys.readouterr().out
    with target.connect() as connection:
        assert connection.scalar(select(models.Check.user_id)) == "usr_lan"


def test_a_missing_sqlite_file_is_reported(tmp_path, capsys):
    assert main(["copy", "--from", f"sqlite:///{tmp_path}/missing.db", "--to", f"sqlite:///{tmp_path}/new.db"]) == 1
    assert "no SQLite file" in capsys.readouterr().err
    assert not (tmp_path / "missing.db").exists()
