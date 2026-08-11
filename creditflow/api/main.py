"""
main.py — CreditFlow FastAPI application

This is Krrish's Python backend — exposes Graph, Settlement, and Risk APIs.
It is called by Chetan's Node/Express backend via synchronous REST requests
(decided integration approach: sync REST over message queue, for simplicity
and debuggability in a mini-project context).

Run locally:
    uvicorn creditflow.api.main:app --reload --port 8000

API Documentation (auto-generated):
    http://localhost:8000/docs   (Swagger UI)
    http://localhost:8000/redoc  (ReDoc)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from creditflow.api.graph_router import router as graph_router
from creditflow.api.settlement_router import router as settlement_router
from creditflow.api.risk_router import router as risk_router

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="CreditFlow — Algorithms & Risk API",
    description=(
        "Graph-theoretic debt settlement engine and Poisson-based credit risk scorer "
        "for the CreditFlow informal merchant network platform.\n\n"
        "**Owner:** Krrish (Backend Logic & Algorithms)\n"
        "**Team:** Krrish · Parth Goggi · Chetan Chavan — SPIT Mumbai, Sem V Mini Project\n\n"
        "### API Groups\n"
        "- **/graph** — Build merchant debt graph, compute Warshall transitive closure, detect cyclic risk\n"
        "- **/settlement** — Greedy minimum settlement, circular debt detection & netting\n"
        "- **/risk** — Poisson-model credit risk scoring (single merchant + portfolio)\n"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow Parth's React frontend (dev: localhost:3000) and Chetan's Node server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:4000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(graph_router)
app.include_router(settlement_router)
app.include_router(risk_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/", tags=["Health"])
def root():
    return {
        "service": "CreditFlow Algorithms & Risk API",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "graph":      "/graph",
            "settlement": "/settlement",
            "risk":       "/risk",
            "docs":       "/docs",
        },
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}
