Build a full-featured screen + webcam + audio recorder web app using TypeScript (Vite + vanilla TS, no framework). The output must be a downloadable MP4 file.

---

## CORE FEATURES

### Recording Sources
- **Screen capture**: uses `getDisplayMedia()` — user can choose tab, window, or entire screen
- **Webcam overlay**: optional PiP (picture-in-picture) webcam feed rendered as a draggable overlay on top of the screen capture canvas
- **Microphone audio**: captured via `getUserMedia({ audio: true })`, mixed into the final recording

### Recording & Output
- Combine screen + webcam overlay using an **OffscreenCanvas** or visible `<canvas>` (draw screen feed as background, webcam as overlay)
- Record the canvas stream + audio using **MediaRecorder API**
- Preferred MIME type: `video/mp4` → fallback to `video/webm; codecs=vp9,opus`
- After stopping, use **FFmpeg.wasm** (`@ffmpeg/ffmpeg` + `@ffmpeg/util`) to:
  - If recorded as WebM: remux/convert to `.mp4` (H.264 + AAC if possible, else copy streams)
  - Output a proper `.mp4` file the browser can download
- Trigger download via `URL.createObjectURL(blob)` → `<a download="recording.mp4">`

---

## UI / UX

### Layout
- Single-page app with a dark studio aesthetic (`#0D0D0F` background)
- Top: app title "RecStudio" in monospace font
- Center: large **preview canvas** (16:9, max ~960px wide) showing live screen + webcam overlay
- Bottom control bar with:
  - [Start Recording] → [Stop Recording] toggle button (red pulsing dot when active)
  - Webcam toggle (on/off)
  - Mic toggle (on/off with live volume meter)
  - Live PiP toggle to open the current preview in browser Picture-in-Picture window
  - Recording timer (MM:SS)
- After recording stops: a **preview section** appears below with:
  - `<video>` player (autoplay, controls)
  - File size indicator
  - [⬇ Download MP4] button
  - [Open PiP] button for the processed result video

### Webcam Overlay
- Rendered in bottom-right corner of canvas by default
- Circular or rounded-rect frame, ~200px wide
- **Draggable** (user can reposition it anywhere on the canvas)
- Toggle visibility without stopping the recording

### Mic Volume Meter
- Small vertical or horizontal bar indicator next to the mic button
- Uses `AnalyserNode` from Web Audio API for real-time level display

### Browser Picture-in-Picture
- Support browser-level Picture-in-Picture for the live preview canvas using a hidden proxy `<video>` fed by `canvas.captureStream()`
- Support Picture-in-Picture for the final `<video>` result after processing
- If Picture-in-Picture is unsupported, disable the controls gracefully and show a warning toast when needed

---

## TECHNICAL REQUIREMENTS

### Stack
- **TypeScript** (strict mode)
- **Vite** as dev server and bundler
- **@ffmpeg/ffmpeg** + **@ffmpeg/util** (WASM, use CDN or npm)
- No React/Vue — vanilla TS + DOM APIs only
- Target modern browsers (Chrome 94+, Edge 94+)

### FFmpeg WASM Setup
- Load FFmpeg lazily (only when user stops recording)
- Show a loading spinner + "Processing video..." status while FFmpeg is working
- Use `toBlobURL` from `@ffmpeg/util` for cross-origin isolated WASM loading
- The app must set proper COOP/COEP headers (configure in `vite.config.ts`):
```ts
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
```

### Canvas Compositing
- Use `requestAnimationFrame` loop to draw:
  1. Screen capture frame → full canvas
  2. Webcam frame → overlay position (respects drag offset)
- Canvas resolution: match screen capture track's native resolution (cap at 1920×1080)

### State Machine
States: `idle` → `requesting-permissions` → `recording` → `processing` → `done`
Each state updates button labels, shows/hides UI sections, and manages resource cleanup.

### Cleanup
- On stop: call `.stop()` on all MediaStreamTracks
- Cancel `requestAnimationFrame` loop
- Release object URLs with `URL.revokeObjectURL()` after download or page unload

---

## FILE STRUCTURE
src/

main.ts           # Entry point, wires up UI events

recorder.ts       # MediaRecorder + stream management class

canvas.ts         # Canvas compositing + RAF loop

ffmpeg.ts         # FFmpeg.wasm wrapper (load, convert, export)

ui.ts             # DOM helpers, state updates, volume meter

types.ts          # Shared TypeScript interfaces/enums

index.html

vite.config.ts

tsconfig.json

---

## ERROR HANDLING
- If `getDisplayMedia` is denied → show toast "Screen access was denied"
- If `getUserMedia` mic is denied → disable mic, show warning, continue without audio
- If `video/mp4` MediaRecorder is unsupported → silently fall back to WebM + FFmpeg remux
- If FFmpeg fails → offer the raw WebM file as fallback download

---

## DELIVERABLE
Working Vite + TypeScript project. Provide all files. Include a short `README.md` with:
- `npm install` + `npm run dev` instructions
- Note about HTTPS requirement for `getDisplayMedia` in production
- Browser compatibility note
