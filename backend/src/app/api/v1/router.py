from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    baselines,
    dashboard,
    dependencies,
    organizations,
    progress,
    projects,
    reports,
    tasks,
    users,
    worklogs,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(organizations.router)
api_router.include_router(users.router)
api_router.include_router(projects.router)
api_router.include_router(tasks.router)
api_router.include_router(dependencies.router)
api_router.include_router(baselines.router)
api_router.include_router(worklogs.router)
api_router.include_router(reports.router)
api_router.include_router(progress.router)
api_router.include_router(progress.cron_router)
api_router.include_router(dashboard.router)
