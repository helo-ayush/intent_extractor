import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import { GoogleGenAI } from "@google/genai";
import cors from 'cors';
import { readFileSync } from "fs";
dotenv.config();

const app = express();
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Load Configuration
const config = JSON.parse(readFileSync("./config.json", "utf8"));
const schemaString = JSON.stringify(config, null, 2);

// Cors Setup
const corsOptions = {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
};
app.use(cors(corsOptions))
app.use(express.json());


// Multer Local Storage
const storage = multer.memoryStorage();
const uploadDir = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } //  10MB file limit
})


app.post('/process-audio', uploadDir.single('audio'), async (req, res) => {
    try {

        // If No Audio File found
        if (!req.file) {
            return res.status(400).json({ error: "No audio file found in the request." });
        }

        // Start timer
        const startTime = Date.now();

        // Transcribing Using Groq Whisper
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: `audio.${req.file.mimetype?.includes("webm") ? "webm" : "mp4"}`,
            contentType: req.file.mimetype || "audio/mp4"
        });
        formData.append('model', 'whisper-large-v3');

        const groqResponse = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
            headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
        });

        const rawTranscript = groqResponse.data.text || "";
        console.log("Transcript:", rawTranscript);

        // Handle empty transcription (e.g., silence or noise)
        if (!rawTranscript || rawTranscript.trim() === "") {
            return res.json({
                message: "No speech detected",
                action: null,
                refined_transcription: "",
                confidence_score: 0
            });
        }

        const prompt = `
            ### ROLE
            You are a highly accurate multilingual Voice-to-Intent Extraction Engine. Your task is to process a raw speech-to-text transcription (which may contain Hindi, English, or a mix of both) and convert it into a structured, executable JSON format based on a provided schema.

            ### INPUT DATA
            1. Raw Transcription: "${rawTranscript}"
            2. Current Context (Date/Time): ${new Date().toLocaleString()}
            3. Actions Schema: ${schemaString}

            ### INSTRUCTIONS & CONSTRAINTS
            - LANGUAGE HANDLING: The transcription may be in Hindi (Devanagari or Roman), English, or a mix of both (code-switching). Handle all these cases.
            - REFINEMENT: Correct phonetic errors, remove filler words (um, uh), and fix grammar to make the sentence meaningful.
              For the "refined_transcription":
              * Keep all English words exactly as they are — do NOT convert English to Hinglish.
              * Only convert Hindi words (Devanagari or any non-Roman script) into Roman/Latin script transliteration.
              * The result should be a natural mix of original English + Romanized Hindi, exactly how an Indian speaker would type it.
              Examples:
              - Input: "कल meeting करते हैं" → Output: "kal meeting krte h" (English "meeting" stays, Hindi converted)
              - Input: "please light on करदो" → Output: "please light on krdo" (English stays, Hindi converted)
              - Input: "send an email to Rahul about the project" → Output: "send an email to Rahul about the project" (pure English stays unchanged)
              - Input: "मुझे एक reminder set करदो" → Output: "mujhe ek reminder set krdo" (English "reminder" and "set" stay)
            - ACTION MATCHING: Match the intent to exactly ONE key from the provided Schema. If no action matches, set "action" to null.
            - ENTITY EXTRACTION: Only extract entities defined in the schema for that specific action. Use null if an entity is missing from the speech.
            - ENTITY VALUE NORMALIZATION: All entity values MUST be resolved into actual, absolute, machine-readable values in English. Use the provided "Current Context (Date/Time)" to resolve any relative references. Never return relative words (e.g. "kal", "tomorrow", "next week") — always compute the actual value (e.g. "2026-02-20"). Never return Hindi/Hinglish words as entity values — always translate to English. Dates must be in YYYY-MM-DD format, times in HH:MM AM/PM format.
            - NO HALLUCINATION: Do not invent information. If the user didn't mention a time, do not guess it.
            - OUTPUT FORMAT: You must return ONLY a valid JSON object. Do not include any conversational text, markdown blocks, or explanations.

            ### EXECUTION STEPS (Chain of Thought)
            1. Identify the core intent of the raw text (regardless of language).
            2. Clean the text: keep English words as-is, transliterate only Hindi words to Roman script.
            3. Compare the intent against the Schema keys.
            4. Extract the variables (entities) required for that key.
            5. Format everything into the final JSON.

            ### REQUIRED OUTPUT SCHEMA
            {
            "refined_transcription": "Cleaned text in Hinglish/Roman script (e.g. 'kal meeting krte h')",
            "summary": "A brief 1-sentence overview of the request in English",
            "action": "The exact ActionKey from the schema or null",
            "entities": {
                "key": "value or null"
            },
            "confidence_score": 0.0 to 1.0 — STRICT SCORING RULES:
              * 0.9 - 1.0: The user's intent DIRECTLY and EXPLICITLY matches the action description. All key entities are mentioned.
              * 0.7 - 0.8: The intent clearly maps to the action, but some entities are missing or ambiguous.
              * 0.4 - 0.6: The intent is loosely related — the action is the closest available match but not a direct fit (e.g. "work in office" mapped to ScheduleMeeting because no better action exists).
              * 0.1 - 0.3: Very weak match, barely related to any action.
              * Use null action with 0.0 if nothing matches at all.
            }
            `;

        const geminiResult = await genAI.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: prompt
        });

        // Clean up the response (remove markdown blocks if present)
        let responseText = geminiResult.text;
        if (!responseText) {
            console.error("No text in Gemini response:", geminiResult);
            return res.status(500).json({ error: "Gemini returned no text response" });
        }
        responseText = responseText.replace(/```json|```/g, "").trim();

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse AI response:", responseText);
            return res.json({ message: responseText, error: "AI returned invalid JSON" });
        }

        const totalTime = Date.now() - startTime;
        console.log(`⏱️ Total: ${totalTime}ms`);
        res.json({ ...parsedResponse, processing_time_ms: totalTime });

    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ error: "Process failed" });
    }
})

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
})
