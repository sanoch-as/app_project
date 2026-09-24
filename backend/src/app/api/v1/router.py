from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    baselines,
    dashboard,
    dependencies,
    jira_import,
    mentions,
    organizations,
    pages,
    progress,
    projects,
    reports,
    spaces,
    task_comments,
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
api_router.include_router(task_comments.router)
api_router.include_router(reports.router)
api_router.include_router(progress.router)
api_router.include_router(progress.cron_router)
api_router.include_router(dashboard.router)
api_router.include_router(jira_import.router)
api_router.include_router(spaces.router)
api_router.include_router(pages.router)
api_router.include_router(mentions.router)
