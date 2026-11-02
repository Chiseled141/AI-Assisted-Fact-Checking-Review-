"""The REST API, listed in AGENT.md."""

from fastapi import APIRouter

from . import checks, claims, system

router = APIRouter(prefix="/api")
router.include_router(checks.router)
router.include_router(claims.router)
router.include_router(system.router)
