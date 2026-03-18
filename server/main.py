from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers import auth, participants, competitions, results, leaderboard, teams, enrollments, categories_phases

app = FastAPI(title="Loyalty Race API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
def root():
    return {"message": "Loyalty Race API"}
