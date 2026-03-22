FROM python:3.11-slim

WORKDIR /app
COPY backend/pyproject.toml /app/backend/pyproject.toml
COPY backend/app /app/backend/app
COPY shared /app/shared
WORKDIR /app/backend
RUN pip install --upgrade pip && pip install -e .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
