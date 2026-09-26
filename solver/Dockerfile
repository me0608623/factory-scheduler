# 排程服務：部署到 Google Cloud Run、Render、Fly.io 等支援 Docker 的平台
# OR-Tools 計算時建議 1 GB 記憶體、2 顆 CPU 以上
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1
RUN pip install --no-cache-dir uv
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
EXPOSE 8080
CMD ["sh", "-c", "exec uv run --frozen --no-sync --no-dev uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
