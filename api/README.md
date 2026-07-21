# API App Placeholder

This repository is a monorepo with both:

- `extension`: Chrome MV3 extension client.
- `api`: backend API service (to be implemented).

Recommended contract with the extension:

- Accept page text payloads (`title`, `url`, `text`, optional `s3Location`).
- Return either:
  - JSON with `mediaUrl`, or
  - JSON with `mp4Base64`, or
  - Binary `video/mp4` response.
