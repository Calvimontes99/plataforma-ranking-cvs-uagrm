FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    GRPC_PORT=50051

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/ai-node/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ai-node/ ./
COPY proto/ ./proto/
RUN python -m grpc_tools.protoc \
    -I ./proto \
    --python_out=. \
    --grpc_python_out=. \
    ./proto/recruitment.proto

EXPOSE 8000 50051
CMD ["sh", "-c", "uvicorn ai_node.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
