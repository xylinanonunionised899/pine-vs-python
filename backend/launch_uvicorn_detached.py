from __future__ import annotations

import sys

sys.path[:0] = [
    r"D:\python , pine script\backend\vendor",
    r"D:\python , pine script\backend",
    r"D:\python , pine script",
]

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
