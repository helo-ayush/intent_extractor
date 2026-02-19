import { useState, useRef } from 'react'
import './App.css'

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [status, setStatus] = useState('idle') // idle, recording, processing, success, error
  const [response, setResponse] = useState(null)
  const [error, setError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp4' })
        await sendAudioToBackend(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setStatus('recording')
      setResponse(null)
      setError(null)
    } catch (err) {
      console.error('Error accessing microphone:', err)
      setError('Failed to access microphone. Please grant permission.')
      setStatus('error')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setStatus('processing')
    }
  }

  const sendAudioToBackend = async (audioBlob) => {
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.mp4')

      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/process-audio`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`)
      }

      const data = await res.json()
      setResponse(data)
      setStatus('success')
    } catch (err) {
      console.error('Error sending audio:', err)
      setError(err.message || 'Failed to process audio')
      setStatus('error')
    }
  }

  return (
    <div className="app">
      <div className="container">
        <h1>🎤 Intent Extraction</h1>
        <p className="subtitle">Record your voice to extract structured intent</p>

        <div className={`status-indicator status-${status}`}>
          {status === 'idle' && '⚪ Ready to record'}
          {status === 'recording' && '🔴 Recording...'}
          {status === 'processing' && '🟡 Processing...'}
          {status === 'success' && '🟢 Complete'}
          {status === 'error' && '🔴 Error'}
        </div>

        <div className="controls">
          {!isRecording ? (
            <button
              className="btn btn-primary"
              onClick={startRecording}
              disabled={status === 'processing'}
            >
              Start Recording
            </button>
          ) : (
            <button
              className="btn btn-danger"
              onClick={stopRecording}
            >
              Stop Recording
            </button>
          )}
        </div>

        {error && (
          <div className="error-box">
            <strong>Error:</strong> {error}
          </div>
        )}

        {response && (
          <div className="response-box">
            <h2>📊 Intent Analysis</h2>

            <div className="response-section">
              <h3>Refined Transcription</h3>
              <p className="transcription">{response.refined_transcription || 'N/A'}</p>
            </div>

            <div className="response-section">
              <h3>Summary</h3>
              <p>{response.summary || 'N/A'}</p>
            </div>

            <div className="response-grid response-grid-3">
              <div className="response-section">
                <h3>Action</h3>
                <p className="action-badge">{response.action || 'None detected'}</p>
              </div>

              <div className="response-section">
                <h3>Confidence</h3>
                <p className="confidence">{(response.confidence_score * 100).toFixed(1)}%</p>
              </div>

              <div className="response-section">
                <h3>Processing Time</h3>
                <p className="processing-time">{response.processing_time_ms} ms</p>
              </div>
            </div>

            <div className="response-section">
              <h3>Extracted Entities</h3>
              <pre className="json-display">
                {JSON.stringify(response.entities || {}, null, 2)}
              </pre>
            </div>

            <details className="raw-json">
              <summary>View Raw JSON</summary>
              <pre className="json-display">
                {JSON.stringify(response, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
