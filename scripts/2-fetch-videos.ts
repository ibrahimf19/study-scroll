import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!
const CANDIDATES_PATH = path.resolve(__dirname, '../data/candidates.json')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopicRow {
  id: string
  title: string
  course_id: string
  courses: { name: string } | null
}

interface CandidatePair {
  video_id: string
  topic_id: string
  course_id: string
}

interface VideoRow {
  id: string
  title: string
  channel: string | null
  thumbnail_url: string | null
  duration_seconds: number
}

// ---------------------------------------------------------------------------
// ISO 8601 duration parser  (e.g. "PT1M30S" → 90, "PT45S" → 45)
// ---------------------------------------------------------------------------

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const hours   = parseInt(match[1] ?? '0', 10)
  const minutes = parseInt(match[2] ?? '0', 10)
  const seconds = parseInt(match[3] ?? '0', 10)
  return hours * 3600 + minutes * 60 + seconds
}

// ---------------------------------------------------------------------------
// YouTube helpers
// ---------------------------------------------------------------------------

async function searchVideoIds(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    videoDuration: 'short',
    maxResults: '15',
    relevanceLanguage: 'en',
    key: YOUTUBE_API_KEY,
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`YouTube search HTTP ${res.status}: ${body}`)
  }

  const json = await res.json() as { items?: { id?: { videoId?: string } }[] }
  return (json.items ?? [])
    .map(item => item.id?.videoId)
    .filter((id): id is string => Boolean(id))
}

async function fetchVideoDetails(ids: string[]): Promise<VideoRow[]> {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    id: ids.join(','),
    key: YOUTUBE_API_KEY,
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`YouTube videos HTTP ${res.status}: ${body}`)
  }

  const json = await res.json() as {
    items?: {
      id: string
      snippet: {
        title: string
        channelTitle: string
        thumbnails?: {
          high?: { url: string }
          medium?: { url: string }
        }
      }
      contentDetails: { duration: string }
    }[]
  }

  return (json.items ?? []).map(item => {
    const thumbs = item.snippet.thumbnails
    return {
      id: item.id,
      title: item.snippet.title,
      channel: item.snippet.channelTitle ?? null,
      thumbnail_url: thumbs?.high?.url ?? thumbs?.medium?.url ?? null,
      duration_seconds: parseDuration(item.contentDetails.duration),
    }
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Clear candidates file at the start for idempotency
  fs.writeFileSync(CANDIDATES_PATH, '[]', 'utf-8')

  // 1. Load all topics joined with course name
  const { data: topics, error: topicsError } = await supabaseAdmin
    .from('topics')
    .select('id, title, course_id, courses(name)')

  if (topicsError) {
    console.error('[FATAL] Failed to load topics:', topicsError.message)
    process.exit(1)
  }

  const rows = topics as unknown as TopicRow[]
  console.log(`Loaded ${rows.length} topics. Starting YouTube searches...\n`)

  // 2. Search per topic, collect (videoId → Set<topicId+courseId>) mapping
  const videoTopicMap = new Map<string, { topic_id: string; course_id: string }[]>()

  for (const topic of rows) {
    const courseName = topic.courses?.name ?? topic.course_id
    const query = `${topic.title} ${courseName}`

    let ids: string[]
    try {
      ids = await searchVideoIds(query)
    } catch (err) {
      console.error(`[ERROR] Topic "${topic.title}": search failed —`, (err as Error).message)
      continue
    }

    console.log(`  [${topic.course_id}] "${topic.title}" → ${ids.length} results`)

    for (const vid of ids) {
      if (!videoTopicMap.has(vid)) videoTopicMap.set(vid, [])
      videoTopicMap.get(vid)!.push({ topic_id: topic.id, course_id: topic.course_id })
    }
  }

  const uniqueIds = [...videoTopicMap.keys()]
  console.log(`\nUnique video IDs collected: ${uniqueIds.length}`)
  console.log('Fetching full metadata in batches of 50...\n')

  // 3. Fetch details in batches of 50
  const allDetails: VideoRow[] = []
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50)
    try {
      const details = await fetchVideoDetails(batch)
      allDetails.push(...details)
    } catch (err) {
      console.error(`[ERROR] Batch ${i / 50 + 1} metadata fetch failed —`, (err as Error).message)
    }
  }

  // 4. Filter to Shorts (≤ 180s)
  const shorts = allDetails.filter(v => v.duration_seconds > 0 && v.duration_seconds <= 180)
  const shortIds = new Set(shorts.map(v => v.id))
  console.log(`Videos after duration filter (≤180s): ${shorts.length} / ${allDetails.length}`)

  // 5. Upsert into videos table
  if (shorts.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from('videos')
      .upsert(shorts, { onConflict: 'id' })

    if (upsertError) {
      console.error('[ERROR] Upsert failed:', upsertError.message)
    } else {
      console.log(`[OK] Upserted ${shorts.length} videos into the videos table`)
    }
  }

  // 6. Build and write candidates.json
  const candidates: CandidatePair[] = []
  for (const [videoId, pairs] of videoTopicMap.entries()) {
    if (!shortIds.has(videoId)) continue
    for (const pair of pairs) {
      candidates.push({ video_id: videoId, ...pair })
    }
  }

  fs.writeFileSync(CANDIDATES_PATH, JSON.stringify(candidates, null, 2), 'utf-8')

  console.log(`\n--- Totals ---`)
  console.log(`Unique videos inserted: ${shorts.length}`)
  console.log(`Candidate (video, topic) pairs written to data/candidates.json: ${candidates.length}`)
  console.log('\nDone.')
}

main()
