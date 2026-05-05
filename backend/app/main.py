from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.roi import router as roi_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(settings.frontend_origin).rstrip("/")],
        allow_credentials=True,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(roi_router)

    return app


app = create_app()
