from datetime import date

from pydantic import BaseModel

from app.services.evm import EVMMetrics
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
