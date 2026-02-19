---
title: Intent Extraction API
emoji: 🎙️
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# Intent Extraction API

A multilingual Voice-to-Intent extraction engine that converts speech (Hindi + English) into structured JSON using Groq Whisper + Gemini.

## Environment Variables

Set these as **Secrets** in your Hugging Face Space settings:

- `GROQ_API_KEY` — Your Groq API key
- `GEMINI_API_KEY` — Your Google Gemini API key
- `FRONTEND_URL` — Your frontend URL (for CORS)
