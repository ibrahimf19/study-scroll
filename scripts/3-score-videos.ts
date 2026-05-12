import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const claude = new Anthropic()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Candidate {
  video_id: string
  topic_id: string
  course_id: string
}

interface VideoRow {
  id: string
  title: string
  channel: string | null
  duration_seconds: number
}

interface TopicRow {
  id: string
  title: string
  description: string | null
  week: number
}

interface ScoreResult {
  score: number
  reasoning: string
}

// ---------------------------------------------------------------------------
// Token-bucket rate limiter
// Allows bursting up to `maxTokens`, then paces at `requestsPerMinute`.
// ---------------------------------------------------------------------------

class RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRatePerMs: number

  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute
    this.tokens = requestsPerMinute       // start full so first burst goes through
    this.lastRefill = Date.now()
    this.refillRatePerMs = requestsPerMinute / 60_000
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now()
      const elapsed = now - this.lastRefill
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerMs)
      this.lastRefill = now

      if (this.tokens >= 1) {
        this.tokens -= 1
        return
      }

      const waitMs = Math.ceil((1 - this.tokens) / this.refillRatePerMs)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }
}

// 45/min — small buffer below the 50/min hard limit
const rateLimiter = new RateLimiter(45)

// ---------------------------------------------------------------------------
// Concurrency pool
// ---------------------------------------------------------------------------

async function pooled<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return results
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You evaluate how relevant a YouTube Short is to a specific university course topic.

Rate relevance 0–100:
  90–100: directly teaches the exact concept for this topic
  70–89:  closely related; would reinforce a student's understanding
  50–69:  same broader field; tangentially useful
  30–49:  same discipline but a different sub-area
  0–29:   unrelated, off-topic, or low educational quality

Return ONLY a JSON object, no prose, no fences:
{ "score": <integer 0-100>, "reasoning": "<one short sentence>" }`

function parseScore(raw: string): ScoreResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const parsed = JSON.parse(cleaned)
  const score = parsed.score
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error(`Invalid score value: ${JSON.stringify(score)}`)
  }
  return { score, reasoning: String(parsed.reasoning ?? '') }
}

async function scorePair(video: VideoRow, topic: TopicRow): Promise<ScoreResult> {
  const userMsg = [
    `Topic: ${topic.title}`,
    `Topic description: ${topic.description ?? '(none)'}`,
    `Video title: ${video.title}`,
    `Channel: ${video.channel ?? 'unknown'}`,
  ].join('\n')

  await rateLimiter.acquire()

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Non-text block from Claude')
  return parseScore(block.text)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const candidates: Candidate[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../data/candidates.json'), 'utf-8')
  )
  const total = candidates.length
  console.log(`Loaded ${total} candidate pairs from data/candidates.json`)

  // Bulk-fetch videos and topics
  const { data: videosData, error: vErr } = await supabaseAdmin
    .from('videos').select('id, title, channel, duration_seconds')
  if (vErr) { console.error('[FATAL] Failed to load videos:', vErr.message); process.exit(1) }

  const { data: topicsData, error: tErr } = await supabaseAdmin
    .from('topics').select('id, title, description, week')
  if (tErr) { console.error('[FATAL] Failed to load topics:', tErr.message); process.exit(1) }

  const videoMap = new Map<string, VideoRow>(
    (videosData as VideoRow[]).map(v => [v.id, v])
  )
  const topicMap = new Map<string, TopicRow>(
    (topicsData as TopicRow[]).map(t => [t.id, t])
  )

  // Load already-scored pairs to skip them (makes re-runs fast and idempotent)
  const { data: existingScores, error: sErr } = await supabaseAdmin
    .from('video_scores').select('video_id, topic_id')
  if (sErr) { console.error('[FATAL] Failed to load existing scores:', sErr.message); process.exit(1) }

  const scoredSet = new Set<string>(
    (existingScores as { video_id: string; topic_id: string }[])
      .map(r => `${r.video_id}:${r.topic_id}`)
  )

  const remaining = candidates.filter(c => !scoredSet.has(`${c.video_id}:${c.topic_id}`))
  console.log(`Already scored: ${scoredSet.size}. Remaining: ${remaining.length}`)
  console.log(`Rate limit: 45 req/min. Estimated time: ~${Math.ceil(remaining.length / 45)} min\n`)

  if (remaining.length === 0) {
    console.log('Nothing to do — all pairs already scored.')
  }

  // Score distribution across all runs
  const { data: allScoresData } = await supabaseAdmin
    .from('video_scores').select('relevance_score')

  const buckets = { '0-29': 0, '30-49': 0, '50-69': 0, '70-89': 0, '90-100': 0 }
  let scoreSum = 0
  let newlyScored = 0
  let skipped = 0
  let completed = 0

  const upsertBuffer: object[] = []

  async function flushBuffer() {
    if (upsertBuffer.length === 0) return
    const batch = upsertBuffer.splice(0, upsertBuffer.length)
    const { error } = await supabaseAdmin
      .from('video_scores')
      .upsert(batch, { onConflict: 'video_id,topic_id' })
    if (error) console.error('[ERROR] Upsert batch failed:', error.message)
  }

  const tasks = remaining.map(candidate => async () => {
    const video = videoMap.get(candidate.video_id)
    const topic = topicMap.get(candidate.topic_id)

    if (!video || !topic) {
      skipped++
      completed++
      return
    }

    let result: ScoreResult
    try {
      result = await scorePair(video, topic)
    } catch (err) {
      console.error(`[ERROR] ${candidate.video_id}/${candidate.topic_id}: ${(err as Error).message}`)
      skipped++
      completed++
      return
    }

    newlyScored++
    scoreSum += result.score
    if (result.score <= 29) buckets['0-29']++
    else if (result.score <= 49) buckets['30-49']++
    else if (result.score <= 69) buckets['50-69']++
    else if (result.score <= 89) buckets['70-89']++
    else buckets['90-100']++

    upsertBuffer.push({
      video_id:        candidate.video_id,
      topic_id:        candidate.topic_id,
      course_id:       candidate.course_id,
      relevance_score: result.score,
      reasoning:       result.reasoning,
    })

    completed++
    if (completed % 25 === 0 || completed === remaining.length) {
      console.log(`Scored ${completed + scoredSet.size}/${total} total (${completed}/${remaining.length} this run)...`)
    }

    if (upsertBuffer.length >= 50) await flushBuffer()
  })

  await pooled(tasks, 5)
  await flushBuffer()

  // Final totals — re-query so we get the full picture including prior run
  const { data: finalScores } = await supabaseAdmin
    .from('video_scores').select('relevance_score')

  const allScores = (finalScores as { relevance_score: number }[]).map(r => r.relevance_score)
  const totalScored = allScores.length
  const totalAvg = totalScored > 0
    ? (allScores.reduce((a, b) => a + b, 0) / totalScored).toFixed(1)
    : 'n/a'

  const finalBuckets = { '0-29': 0, '30-49': 0, '50-69': 0, '70-89': 0, '90-100': 0 }
  for (const s of allScores) {
    if (s <= 29) finalBuckets['0-29']++
    else if (s <= 49) finalBuckets['30-49']++
    else if (s <= 69) finalBuckets['50-69']++
    else if (s <= 89) finalBuckets['70-89']++
    else finalBuckets['90-100']++
  }

  console.log(`
--- Final Summary ---
Total candidate pairs:   ${total}
Total scored (all runs): ${totalScored}
Newly scored this run:   ${newlyScored}
Skipped/errored:         ${skipped}
Average score:           ${totalAvg}

Score distribution:
  90–100 (directly on-topic):   ${finalBuckets['90-100']}
  70–89  (reinforces topic):    ${finalBuckets['70-89']}
  50–69  (tangentially useful): ${finalBuckets['50-69']}
  30–49  (different sub-area):  ${finalBuckets['30-49']}
  0–29   (unrelated):           ${finalBuckets['0-29']}
`)
}

main()
