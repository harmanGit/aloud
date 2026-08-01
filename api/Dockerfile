FROM python:3.12-slim AS builder

WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Download Kokoro ONNX model files from GitHub releases (no Hugging Face)
FROM python:3.12-slim AS model-downloader

RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

ARG KOKORO_MODEL_URL=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
ARG KOKORO_VOICES_URL=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

RUN mkdir -p /models \
    && wget -q -O /models/kokoro-v1.0.onnx "$KOKORO_MODEL_URL" \
    && wget -q -O /models/voices-v1.0.bin "$KOKORO_VOICES_URL"

FROM python:3.12-slim AS runtime

WORKDIR /aloud
ENV PATH="/opt/venv/bin:$PATH"
ENV KOKORO_MODEL_PATH="/models/kokoro-v1.0.onnx"
ENV KOKORO_VOICES_PATH="/models/voices-v1.0.bin"

COPY --from=builder /opt/venv /opt/venv
COPY --from=model-downloader /models /models
COPY src ./src

EXPOSE 5000
