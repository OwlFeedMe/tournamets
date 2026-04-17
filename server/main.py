import os
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db, run_db_migrations
from routers import (
    auth,
    participants,
    competitions,
    results,
    leaderboard,
    teams,
    enrollments,
    categories_phases,
    schedule,
    finance,
    organizer_applications,
    config,
    system_status,
    interest_notifications,
    checkin_qr,
    judge_cards,
)

app = FastAPI(title="FinalRep API", version="1.0.0")
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(participants.router)
app.include_router(competitions.router)
app.include_router(results.router)
app.include_router(leaderboard.router)
app.include_router(teams.router)
app.include_router(enrollments.router)
app.include_router(categories_phases.router)
app.include_router(schedule.router)
app.include_router(finance.router)
app.include_router(organizer_applications.router)
app.include_router(config.router)
app.include_router(system_status.router)
app.include_router(interest_notifications.router)
app.include_router(checkin_qr.router)
app.include_router(judge_cards.router)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


@app.on_event("startup")
def startup():
    def _bootstrap_db() -> None:
        run_db_migrations()
        init_db()

    threading.Thread(target=_bootstrap_db, daemon=True).start()


@app.get("/")
def root():
    return {"message": "FinalRep API"}
