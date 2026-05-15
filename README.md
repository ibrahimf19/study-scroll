# Study Scroll

Course-specific TikTok-style feed of YouTube Shorts for university students.

## Try it

[study-scroll.vercel.app](https://study-scroll.vercel.app)

## How it works

A student picks a course from the catalog. An AI pipeline parses the course syllabus into weekly topics, then searches YouTube Shorts for each topic and runs every result through Claude Haiku to score its relevance to the course material. The feed surfaces the highest-scored videos, one per scroll, in a native short-form player.

## Stack

- Next.js 14, TypeScript, Tailwind CSS
- Supabase (Postgres)
- Anthropic API — Sonnet 4.6 for syllabus parsing, Haiku 4.5 for relevance scoring
- YouTube Data API v3
- Vercel

## What's in this repo

- `app/` and `components/` — the feed UI (scroll-snap player, like/save interactions, device-based persistence)
- `scripts/` — the data pipeline; run individual stages with `npx tsx scripts/N-*.ts`
- `sessions/` — full Claude Code transcripts of each day's build session

---

Built solo in one week.
