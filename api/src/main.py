from fastapi import FastAPI
from src.synthesis_request import SynthesisRequest

app = FastAPI(docs_url="/docs", redoc_url=None)


@app.get("/health")
def health():
    return "Healthy"


@app.post("/synthesis")
def synthesis(request: SynthesisRequest):
    print(request)

    return {
        "message": "Item created",
        "text_count": len(request.text),
        "preview": request.text[:5],
    }
