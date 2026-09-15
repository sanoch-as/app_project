import uuid
from datetime import date

from pydantic import BaseModel

from app.core.enums import TaskStatus
from app.services.evm import EVMMetrics
from app.services.progress_service import ProjectedProgress, TaskProjectedProgress
from app.services.scurve import SCurvePoint


class EVMMetricsRead(BaseModel):
    pv: float
    ev: float
    ac: float
    spi: float | None
    cpi: float | None

    @classmethod
    def from_metrics(cls, metrics: EVMMetrics) -> "EVMMetricsRead":
        return cls(pv=metrics.pv, ev=metrics.ev, ac=metrics.ac, spi=metrics.spi, cpi=metrics.cpi)


class SCurvePointRead(BaseModel):
    week_ending: date
    pv: float
    ev: float
    ac: float
    spi: float | None
    cpi: float | None

    @classmethod
    def from_point(cls, point: SCurvePoint) -> "SCurvePointRead":
        return cls(
            week_ending=point.week_ending,
            pv=point.metrics.pv,
            ev=point.metrics.ev,
            ac=point.metrics.ac,
            spi=point.metrics.spi,
            cpi=point.metrics.cpi,
        )


class ProgressResponse(BaseModel):
    status_date: date
    current: EVMMetricsRead
    s_curve: list[SCurvePointRead]


class RecalculateResponse(BaseModel):
    status_date: date
    current: EVMMetricsRead


class RecalculateAllResponse(BaseModel):
    projects_recalculated: int


class TaskPlannedProgressRead(BaseModel):
    task_id: uuid.UUID
    wbs_code: str
    name: str
    status: TaskStatus
    planned_start_date: date | None
    planned_end_date: date | None
    planned_percent_complete: float
    actual_percent_complete: float

    @classmethod
    def from_row(cls, row: TaskProjectedProgress) -> "TaskPlannedProgressRead":
        return cls(
            task_id=row.task.id,
            wbs_code=row.task.wbs_code,
            name=row.task.name,
            status=row.task.status,
            planned_start_date=row.planned_start_date,
            planned_end_date=row.planned_end_date,
            planned_percent_complete=row.planned_percent_complete,
            actual_percent_complete=row.actual_percent_complete,
        )


class ProjectedProgressResponse(BaseModel):
    status_date: date
    baseline_id: uuid.UUID | None
    baseline_name: str | None
    project_planned_percent_complete: float | None
    project_actual_percent_complete: float
    tasks: list[TaskPlannedProgressRead]

    @classmethod
    def from_result(cls, result: ProjectedProgress) -> "ProjectedProgressResponse":
        return cls(
            status_date=result.status_date,
            baseline_id=result.baseline_id,
            baseline_name=result.baseline_name,
            project_planned_percent_complete=result.project_planned_percent_complete,
            project_actual_percent_complete=result.project_actual_percent_complete,
            tasks=[TaskPlannedProgressRead.from_row(t) for t in result.tasks],
        )
