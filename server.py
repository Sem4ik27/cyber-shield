import os
import sys
from pathlib import Path


def use_venv_if_needed():
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
        return
    except ImportError:
        pass

    base = Path(__file__).resolve().parent
    candidates = [
        base / ".venv" / "bin" / "python",
        base / ".venv" / "Scripts" / "python.exe",
    ]
    for candidate in candidates:
        if candidate.exists() and Path(sys.executable) != candidate:
            os.execv(str(candidate), [str(candidate), str(Path(__file__).resolve())] + sys.argv[1:])
    raise SystemExit("FastAPI не установлен. Выполните: pip install -r requirements.txt")


use_venv_if_needed()

import uvicorn

from app import HOST, PORT, ROOT_PATH, app


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, root_path=ROOT_PATH or "")
