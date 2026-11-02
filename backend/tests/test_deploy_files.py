"""Docker isn't available everywhere tests run, so this checks that the deploy files fit together."""

from pathlib import Path

import yaml

ROOT = Path(__file__).parent.parent.parent


def test_the_backend_image_has_what_it_needs_to_migrate():
    dockerfile = (ROOT / "backend" / "Dockerfile").read_text()
    assert "COPY migrations" in dockerfile
    assert "COPY alembic.ini" in dockerfile


def test_compose_services_and_secrets():
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text())
    assert set(compose["services"]) == {"postgres", "redis", "backend", "web"}
    backend = compose["services"]["backend"]
    assert backend["env_file"] == ["backend/.env"]
    assert backend["environment"]["DATABASE_URL"].startswith("postgresql+psycopg://")
    assert backend["environment"]["REDIS_URL"].startswith("redis://redis")
    # Only Nginx is reachable from outside.
    assert [name for name, service in compose["services"].items() if "ports" in service] == ["web"]


def test_nginx_proxies_the_api_and_serves_the_app():
    conf = (ROOT / "frontend" / "nginx.conf").read_text()
    assert "proxy_pass http://backend:8000" in conf
    assert "try_files $uri /index.html" in conf


def test_the_frontend_image_builds_for_the_real_backend():
    assert "VITE_API_URL" in (ROOT / "frontend" / "Dockerfile").read_text()


def test_ci_runs_both_test_suites():
    workflow = yaml.safe_load((ROOT / ".github" / "workflows" / "ci.yml").read_text())
    steps = str(workflow["jobs"])
    assert "uv run pytest" in steps
    assert "uv run ruff check" in steps
    assert "npm test" in steps


def test_secrets_are_ignored_by_git():
    assert ".env" in (ROOT / ".gitignore").read_text().split()
    for folder in ("backend", "frontend"):
        assert ".env" in (ROOT / folder / ".dockerignore").read_text().split()
