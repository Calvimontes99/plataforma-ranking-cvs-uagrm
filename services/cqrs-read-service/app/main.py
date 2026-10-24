import logging
import os
from contextlib import asynccontextmanager
from io import BytesIO

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, StreamingResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import ValidationError
from sqlalchemy import text

from app.consumer import RabbitEventConsumer
from app.database import engine, report_engine, initialize_schema, readonly_session
from app.exports import export_pdf, export_xlsx
from app.query import ExportRequest, ReportQuery, UnsafeQueryError, VoiceQueryRequest
from app.reports import prepare_query, run_report

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_schema()
    consumer = RabbitEventConsumer()
    consumer.start()
    try:
        yield
    finally:
        consumer.stop()
        engine.dispose()
        if report_engine is not engine:
            report_engine.dispose()


app = FastAPI(
    title="CQRS Read Service",
    version="1.0.0",
    description="Read-only reporting over a denormalized recruitment projection.",
    lifespan=lifespan,
)
instrumentator = Instrumentator()
instrumentator.instrument(app)
instrumentator.expose(app, endpoint="/metrics", include_in_schema=False)


@app.exception_handler(UnsafeQueryError)
async def unsafe_query_handler(_: Request, exc: UnsafeQueryError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(ValidationError)
async def translated_query_validation_handler(_: Request, exc: ValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(exc.errors(include_url=False))},
    )


@app.get("/health")
@app.get("/api/v1/read/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Database health check failed")
        raise HTTPException(status_code=503, detail="database unavailable")
    return {"service": "cqrs-read-service", "status": "ok"}


@app.get("/reports/schema")
@app.get("/api/v1/read/reports/schema")
def report_schema():
    return ReportQuery.model_json_schema()


@app.post("/reports/voice-query")
@app.post("/api/v1/read/reports/voice-query")
def voice_query(body: VoiceQueryRequest):
    query = prepare_query(body)
    with readonly_session() as session:
        rows = run_report(session, query)
    return {
        "query": query.model_dump(mode="json", exclude={"question"}),
        "json_schema": ReportQuery.model_json_schema(),
        "count": len(rows),
        "results": rows,
    }


@app.post("/reports/export")
@app.post("/api/v1/read/reports/export")
def report_export(body: ExportRequest):
    query = prepare_query(body)
    with readonly_session() as session:
        rows = run_report(session, query)
    headers = [field.value for field in query.fields]
    if body.format == "xlsx":
        content: BytesIO = export_xlsx(rows, headers)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "candidaturas.xlsx"
    else:
        content = export_pdf(rows, headers)
        media_type = "application/pdf"
        filename = "candidaturas.pdf"
    return StreamingResponse(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
