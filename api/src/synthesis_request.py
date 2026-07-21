from pydantic import BaseModel


class SynthesisRequest(BaseModel):
    text: str | list[str]
    local_play: bool = False
    download: bool = False
    delivery: bool = False
    delivery_url: str | None = None
    delivery_token: str | None = None
