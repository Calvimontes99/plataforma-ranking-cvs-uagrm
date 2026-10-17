# AI Node

Python 3.11 service implementing the `recruitment.v1.AiService` gRPC server,
REST inference APIs, and a guarded MCP client/host for sequential HR missions.
The startup-trained supervised RandomForest and unsupervised K-Means models use
deterministic synthetic HR data. REST clustering returns affinity profile names.

TensorFlow preprocesses document images and computes CNN structural/seal-color
indicators; Tesseract OCR is used where available. Text PDFs are extracted
directly and scanned PDFs are rendered for OCR. Asynchronous Video-CV processing
is supported. Video metrics include sampled
face/eye detection and audio-activity/fluency proxies. These are heuristics, not
proof of attention or communication quality, and require human review.

## Run locally

From this directory with Python 3.11:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m grpc_tools.protoc -I ..\..\proto --python_out=. --grpc_python_out=. ..\..\proto\recruitment.proto
uvicorn ai_node.main:app --host 0.0.0.0 --port 8000
```

HTTP uses `PORT` (default `8000`) and the gRPC server uses `GRPC_PORT` (default
`50051`). Docker regenerates the Python bindings from the shared proto during
the build.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | FastAPI HTTP listen port. |
| `GRPC_PORT` | gRPC `AiService` listen port. |
| `VACANCIES_MCP_URL` | Base URL for the vacancies MCP server. |
| `INGESTION_MCP_URL` | Base URL for the ingestion MCP server. |
| `RANKING_MCP_URL` | Base URL for the ranking MCP server. |
| `MCP_BEARER_TOKEN` | Optional bearer token for protected MCP endpoints. |

## HTTP API

- `GET /health`
- `POST /api/v1/ai/extract-document`
- `POST /api/v1/ai/generate-embedding`
- `POST /api/v1/ai/predict-compatibility`
- `POST /api/v1/ai/cluster-talent`
- `POST /api/v1/ai/analyze-video`
- `POST /agents/execute-mission`

The mission orchestrator discovers MCP tools and ingestion resources before
calling tools in vacancy → historical-candidate-search → ranking order. It
returns a ranked shortlist, proposed (not booked) interview windows, bounded
context memory, and a mission hash for audit. Only allowlisted, read-only
mission intents are accepted.

## Tests

From this directory, run `python -m pytest -q`. Tests use local gRPC/inference
and mocked MCP HTTP endpoints; no downstream service is required.
