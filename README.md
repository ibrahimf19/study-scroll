# Study Scroll

A TikTok-style feed of YouTube Shorts curated by university course. Built for the YC Startup School application.

## Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **Database**: Supabase (Postgres)
- **AI**: Anthropic Claude (via `@anthropic-ai/sdk`)
- **Video source**: YouTube Data API v3
- **Deployment**: Vercel

## What's working today (Day 1)

- Course selector page (`/`) — fetches courses from Supabase and renders tappable cards on a mobile-first dark theme
- Feed placeholder page (`/feed/[courseId]`) — displays course name, ready for video integration
- Supabase client setup (`lib/supabase.ts`) — browser-safe anon client + server-only admin client

## Getting started

1. Copy `.env.local.example` to `.env.local` and fill in your keys.
2. Install dependencies: `npm install`
3. Run the dev server: `npm run dev`

## Project structure

```
app/              Next.js App Router pages
components/       Shared UI components
lib/              Utility modules (Supabase clients, etc.)
scripts/          One-off data scripts (seeding, ingestion)
data/syllabi/     Raw syllabus files for AI processing
sessions/         Scratch space for ongoing work
```
