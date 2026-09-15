import enum


class UserRole(enum.StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class ProjectStatus(enum.StrEnum):
    PLANNING = "planning"
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TaskStatus(enum.StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    COMPLETED = "completed"


class TaskPriority(enum.StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class DependencyType(enum.StrEnum):
    FS = "FS"
    SS = "SS"
    FF = "FF"
    SF = "SF"
