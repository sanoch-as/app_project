"""Vercel entrypoint: exposes the FastAPI ASGI app directly. Vercel's Python
runtime detects the `app` ASGI callable and routes all traffic to it.

`src/` is added to `sys.path` (rather than importing `src.app.main`) so the
package is always imported as top-level `app.*`, exactly like local dev
(`uvicorn app.main:app`, tests via `pythonpath = ["src"]` in pyproject.toml).
Mixing `app.*` and `src.app.*` import paths for the same modules would
double-register SQLAlchemy's declarative mappers."""

import sys
from pathlib import Path

_SRC_DIR = Path(__file__).resolve().parent.parent / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

from app.main import app  # noqa: E402

__all__ = ["app"]
