@echo off
cd /d "D:\python , pine script\backend"
set PYTHONPATH=D:\python , pine script\backend\vendor;D:\python , pine script\backend;D:\python , pine script
"C:\Users\sakth\Desktop\vayu\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
