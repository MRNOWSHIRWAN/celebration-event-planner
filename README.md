# Celebration & Event Planner

A GenAI planning assistant for weddings, birthdays and community events. Enter event type, guests, budget, date, city and notes. You get:

- **Budget**: category split that always adds up to your total (calculated in code, not by the model).
- **Timeline**: milestone dates counted back from the event date. If the event is too close, late tasks move to today and a warning shows.
- **Personalised ideas, vendor/task checklist, vendor questions, tips**: written by a generative AI model (Google Gemini REST API) from your inputs and notes.

## Run

    npm test                       # 22 tests, no dependencies
    GEMINI_API_KEY=... npm start   # http://localhost:8080

No npm packages needed (Node 18+). The API key stays on the server. Without a key the app still returns the budget and timeline and shows a clear "AI could not run" message. It never fakes AI output.

## How it handles bad input and failures
- Validation: event type, guests (1-5000 whole), budget (1,000+), real future date. Errors are shown in the form.
- Notes are sent to the model as quoted data, output is parsed and stripped of markup before display.
- Rate limit of 10 requests per minute per IP, 10 KB request limit, path traversal blocked.
- AI failure or bad model reply returns budget + timeline with an honest error.

## Accessibility
Labelled fields, keyboard operable, visible focus, live regions for status and errors, skip link, tables with headers, no colour-only information.

## Gen AI use
Runtime: Google Gemini (`generateContent`, default model `gemini-3.5-flash`, override with `GEMINI_MODEL`) for ideas, checklist, vendor questions and tips.

## Privacy & data use (draft - pending public-text review)

This demo sends form inputs (event type, guests, budget, date, city, notes) to the Gemini API on Google's free tier. Google may use free-tier prompts and responses to improve its products - do not submit personal or sensitive information.

Retention, stated exactly:
- The app has no database and writes no logs of its own. Generated plans (with the inputs that produced them) are held only in a temporary in-memory cache for up to 10 minutes to conserve API quota, then discarded. Nothing is written to disk by the app.
- Hosting (Vercel) and Google may keep their own operational logs and retention per their policies; this app does not control those.
