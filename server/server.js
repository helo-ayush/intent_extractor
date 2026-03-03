// Import the Express framework to create and manage the HTTP server
import express from 'express';
// Import dotenv to load environment variables from a .env file into process.env
import dotenv from 'dotenv';
// Import multer for handling multipart/form-data (file uploads like audio)
import multer from 'multer';
// Import axios for making HTTP requests (used to call the Groq Whisper API)
import axios from 'axios';
// Import FormData to construct multipart form data payloads for API calls
import FormData from 'form-data';
// Import the Google Generative AI SDK to interact with Gemini models
import { GoogleGenAI } from "@google/genai";
// Import CORS middleware to allow cross-origin requests from the frontend
import cors from 'cors';
// Import readFileSync from Node's fs module to synchronously read files from disk
import { readFileSync } from "fs";
// Load environment variables from the .env file into process.env
dotenv.config();

// Create a new Express application instance
const app = express();
// Initialize the Google Generative AI client using the API key from environment variables
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Read and parse the config.json file which contains the actions schema (ScheduleMeeting, SendEmail, etc.)
const config = JSON.parse(readFileSync("./config.json", "utf8"));
// Convert the config object back to a formatted JSON string so it can be embedded in the AI prompt later
const schemaString = JSON.stringify(config, null, 2);

// Define CORS options: allow requests from the frontend URL (or any origin if not set), only GET/POST methods, and allow credentials
const corsOptions = {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
};
// Apply the CORS middleware to the Express app with the above options
app.use(cors(corsOptions))
// Enable Express to automatically parse incoming JSON request bodies
app.use(express.json());


// Configure multer to store uploaded files in memory (as a Buffer) instead of writing to disk
const storage = multer.memoryStorage();
// Create a multer upload handler with the memory storage config and a 10MB file size limit
const uploadDir = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } //  10MB file limit
})


// Define a POST endpoint at '/process-audio' that accepts a single file upload with the field name 'audio'
app.post('/process-audio', uploadDir.single('audio'), async (req, res) => {
    try {

        // If no audio file was included in the request, return a 400 Bad Request error
        if (!req.file) {
            return res.status(400).json({ error: "No audio file found in the request." });
        }

        // Record the current timestamp to measure total processing time later
        const startTime = Date.now();

        // ===== GROQ WHISPER (commented out — replaced by Sarvam AI below) =====
        // const formData = new FormData();
        // formData.append('file', req.file.buffer, {
        //     filename: `audio.${req.file.mimetype?.includes("webm") ? "webm" : "mp4"}`,
        //     contentType: req.file.mimetype || "audio/mp4"
        // });
        // formData.append('model', 'whisper-large-v3');
        //
        // const groqResponse = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
        //     headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
        // });
        //
        // const rawTranscript = groqResponse.data.text || "";
        // console.log("Transcript:", rawTranscript);
        //
        // if (!rawTranscript || rawTranscript.trim() === "") {
        //     return res.json({
        //         message: "No speech detected",
        //         action: null,
        //         refined_transcription: "",
        //         confidence_score: 0
        //     });
        // }
        // ===== END GROQ WHISPER =====

        // Build multipart form data to send the audio file to Sarvam AI's Speech-to-Text REST API
        const formData = new FormData();
        // Append the audio buffer from multer's memory storage with the correct filename and content type
        formData.append('file', req.file.buffer, {
            filename: `audio.${req.file.mimetype?.includes("webm") ? "webm" : "mp4"}`,
            contentType: req.file.mimetype || "audio/mp4"
        });
        // Use the saaras:v3 model (best for Indian languages) with "transcribe" mode
        formData.append('model', 'saaras:v3');
        formData.append('language_code', 'unknown');

        // Send the audio to Sarvam AI's Speech-to-Text API for transcription
        const sarvamResponse = await axios.post('https://api.sarvam.ai/speech-to-text', formData, {
            headers: {
                ...formData.getHeaders(),
                'api-subscription-key': process.env.SARVAM_API_KEY
            }
        });

        // Extract the transcribed text from the Sarvam API response
        const rawTranscript = sarvamResponse.data.transcript || "";
        console.log("Transcript:", rawTranscript);

        // If the transcript is empty or whitespace-only (silence/noise), return a "no speech" response
        if (!rawTranscript || rawTranscript.trim() === "") {
            return res.json({
                message: "No speech detected",
                action: null,
                refined_transcription: "",
                confidence_score: 0
            });
        }

        // Build the detailed prompt for Gemini AI that instructs it to: identify intent, refine the transcription,
        // match an action from the schema, extract entities, normalize values, and return structured JSON
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

        // Send the prompt to Gemini AI (gemini-2.5-flash-lite model) and await the generated response
        const geminiResult = await genAI.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: prompt
        });

        // Extract the text content from the Gemini response
        let responseText = geminiResult.text;
        // If Gemini returned no text, log the error and respond with a 500 status
        if (!responseText) {
            console.error("No text in Gemini response:", geminiResult);
            return res.status(500).json({ error: "Gemini returned no text response" });
        }
        // Remove any markdown code-block wrappers (```json ... ```) that Gemini might have included
        responseText = responseText.replace(/```json|```/g, "").trim();

        // Declare a variable to hold the parsed JSON object
        let parsedResponse;
        try {
            // Attempt to parse the cleaned response text as JSON
            parsedResponse = JSON.parse(responseText);
        } catch (e) {
            // If parsing fails, log the raw response and return it with an error message
            console.error("Failed to parse AI response:", responseText);
            return res.json({ message: responseText, error: "AI returned invalid JSON" });
        }

        // Calculate the total processing time in milliseconds (transcription + AI extraction)
        const totalTime = Date.now() - startTime;
        // Log the total processing time to the console
        console.log(`⏱️ Total: ${totalTime}ms`);
        // Send the parsed AI response along with the processing time back to the client
        res.json({ ...parsedResponse, processing_time_ms: totalTime });

    } catch (err) {
        // Catch any unexpected errors in the entire pipeline and log them
        console.error("Server Error:", err);
        // Return a generic 500 Internal Server Error response
        res.status(500).json({ error: "Process failed" });
    }
})

// Start the Express server on the configured PORT (from .env) or default to port 3000
app.listen(process.env.PORT || 3000, () => {
    // Log a confirmation message once the server is successfully running
    console.log(`Server running on port ${process.env.PORT || 3000}`);
})
