from fastapi import FastAPI, HTTPException

from src.kokoro_service import build_english_narration
from src.synthesis_request import SynthesisRequest

app = FastAPI(docs_url="/docs", redoc_url=None)


@app.get("/health")
def health():
    return "Healthy"


@app.post("/synthesis")
def synthesis(request: SynthesisRequest):
    try:
        result = build_english_narration(request.text, request.title)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Synthesis failed: {error}",
        ) from error

    return {
        "ok": True,
        "message": "Generated English narration from page text.",
        "sourceLanguage": result["source_language"],
        "translated": result["translated"],
        "translatedText": result["translated_text"],
        "audioBase64": result["audio_base64"],
        "mimeType": "audio/wav",
        "fileName": result["file_name"],
    }
