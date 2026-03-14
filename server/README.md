---
title: Intent Extraction API
emoji: 🎙️
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# Intent Extraction API

A multilingual Voice-to-Intent extraction engine that converts speech (Hindi + English) into structured JSON using Sarvam AI (Speech-to-Text) and Google Gemini (Intent Extraction).

## Features
- **Multilingual Support**: Handles English, Hindi, and code-switched Hinglish seamlessly.
- **Structural Output**: Returns clean, predictable JSON based on a defined schema.
- **Entity Normalization**: Automatically converts relative dates ("kal", "tomorrow") and Hindi terms into absolute, machine-readable English values (e.g., `2026-02-20`).

---

## 🚀 API Documentation

### Endpoint
`POST /api/v1/extract-intent`

### Request Format
The API expects a `multipart/form-data` request containing the audio file.

- **Field Name**: `audio`
- **Supported Formats**: `.mp3`, `.m4a`, `.wav`, `.webm`, `.mp4`
- **Max File Size**: 10 MB

#### Example Request (Frontend / Fetch API)
```javascript
const formData = new FormData();
// audioBlob is the recorded audio data from the microphone
formData.append('audio', audioBlob, 'recording.webm');

const response = await fetch('https://your-api-url.com/api/v1/extract-intent', {
  method: 'POST',
  body: formData,
});

const data = await response.json();
console.log(data);
```

#### Example Request (cURL)
```bash
curl -X POST https://your-api-url.com/api/v1/extract-intent \
  -H "Content-Type: multipart/form-data" \
  -F "audio=@/path/to/your/audio.wav"
```

---

### Response Format
The API responds with a structured JSON object containing the intent, extracted entities, and processing metadata.

#### Success Response (200 OK)
```json
{
  "refined_transcription": "kal meeting krte h Rahul ke sath",
  "summary": "The user wants to schedule a meeting with Rahul tomorrow.",
  "action": "ScheduleMeeting",
  "entities": {
    "participants": "Rahul",
    "time": null,
    "date": "2026-02-21",
    "duration": null,
    "location_mode": null
  },
  "confidence_score": 0.95,
  "processing_time_ms": 1850
}
```

#### Response Details
| Field | Type | Description |
|-------|------|-------------|
| `refined_transcription` | String | A cleaned, Romanized (Hinglish) version of the transcription. English words are kept as-is. |
| `summary` | String | A brief 1-sentence English summary of the user's intent. |
| `action` | String / `null` | The exact Action Key matched from the schema (e.g., `ScheduleMeeting`, `CreateTask`). `null` if no match is found. |
| `entities` | Object | Extracted details specific to the `action`. Values are normalized into absolute English strings (e.g., dates in `YYYY-MM-DD`). |
| `confidence_score` | Number | `0.0` to `1.0`. Measures how directly the intent maps to the schema action. |
| `processing_time_ms`| Number | Total backend processing time (STT + LLM) in milliseconds. |

#### Edge Cases
**1. No Speech Detected**
If the audio contains only silence or background noise:
```json
{
  "message": "No speech detected",
  "action": null,
  "refined_transcription": "",
  "confidence_score": 0
}
```

**2. Error Responses**
- `400 Bad Request`: `{"error": "No audio file found in the request."}`
- `500 Internal Server Error`: `{"error": "Process failed"}` or `{"error": "Gemini returned no text response"}`

---

## 🛠️ Local Development

### Prerequisites
- Node.js (v18 or higher recommended)
- API Keys for **Sarvam AI** and **Google Gemini**

### Setup (Without Docker)
1. Clone the repository and navigate to the `server` folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file from the example:
   * **Using Terminal**:
     ```bash
     cp .env.example .env
     ```
   * **Using Mouse/Keyboard (Manual)**:
     1. Open the folder in File Explorer or Finder.
     2. Open `.env.example` in a text editor (Notepad, VS Code).
     3. Copy all the text.
     4. Create a new file named `.env` and paste the text.
     5. Replace `your_key_here` with your actual API keys.
4. Start the development server:
   ```bash
   npm run dev
   ```

### Setup (With Docker - Recommended for others)
If someone else wants to run your backend locally without installing Node.js, they just need Docker installed:
1. Clone the repository and navigate to the `server` folder.
2. Copy the example config to create your `.env` file:
   * **Using Terminal**:
     ```bash
     cp .env.example .env
     ```
   * **Using Mouse/Keyboard (Manual)**:
     1. Open `.env.example` in a text editor.
     2. Copy everything, create a new file named exactly `.env` in the same folder, and paste the text.
     3. Replace the placeholder text with your actual API keys.
3. Run the container:
   ```bash
   docker-compose up -d
   ```
The API is now running at `http://localhost:3000`.

## ☁️ Deployment (Hugging Face / Docker)
The application is pre-configured with a `Dockerfile` for easy deployment on Hugging Face Spaces or any Docker-compatible platform. Ensure you set the `SARVAM_API_KEY`, `GEMINI_API_KEY`, and `FRONTEND_URL` as Environment Secrets in your hosting provider.
