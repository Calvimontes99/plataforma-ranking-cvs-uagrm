from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from ai_node import __version__
from ai_node.api import router
from ai_node.inference import AiInference
from ai_node.orchestrator import DownstreamServices, McpMissionOrchestrator


def create_app(start_grpc: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        application.state.inference = AiInference()
        application.state.orchestrator = McpMissionOrchestrator(
            DownstreamServices(
                vacancies_url=os.getenv("VACANCIES_MCP_URL", ""),
                ingestion_url=os.getenv("INGESTION_MCP_URL", ""),
                ranking_url=os.getenv("RANKING_MCP_URL", ""),
            )
        )
        grpc_server = None
        if start_grpc:
            from ai_node.grpc_server import start_grpc_server

            grpc_server = start_grpc_server(application.state.inference, int(os.getenv("GRPC_PORT", "50051")))
            application.state.grpc_server = grpc_server
        try:
            yield
        finally:
            if grpc_server is not None:
                grpc_server.stop(grace=2).wait()
            await application.state.orchestrator.close()

    application = FastAPI(title="Recruitment AI Node", version=__version__, lifespan=lifespan)
    application.include_router(router)
    return application


app = create_app()
