import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// Load env before anything reads process.env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const client = new Anthropic() // reads ANTHROPIC_API_KEY from env

const COURSE_MAP: Record<string, string> = {
  'linear-algebra.txt': 'western-math1600',
  'cs1027.txt':         'western-cs1027',
  'calculus.txt':       'western-calc1000',
}

const SYLLABI_DIR = path.resolve(__dirname, '../data/syllabi')

interface Topic {
  week: number
  title: string
  description: string
}

function parseTopicsFromResponse(raw: string): Topic[] {
  // Strip optional ```json ... ``` fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const parsed = JSON.parse(cleaned)

  if (!Array.isArray(parsed?.topics)) {
    throw new Error('Response JSON missing "topics" array')
  }

  return (parsed.topics as unknown[]).map((item, i) => {
    const t = item as Record<string, unknown>
    if (typeof t.week !== 'number' || typeof t.title !== 'string' || typeof t.description !== 'string') {
      throw new Error(`Topic at index ${i} is missing required fields (week: int, title: string, description: string)`)
    }
    return { week: t.week, title: t.title, description: t.description } as Topic
  })
}

async function extractTopics(filename: string, courseId: string): Promise<void> {
  const filePath = path.join(SYLLABI_DIR, filename)

  if (!fs.existsSync(filePath)) {
    console.error(`[SKIP] ${filename}: file not found at ${filePath}`)
    return
  }

  const syllabusText = fs.readFileSync(filePath, 'utf-8').trim()
  if (!syllabusText) {
    console.error(`[SKIP] ${filename}: file is empty`)
    return
  }

  console.log(`\n[PROCESSING] ${filename} → course_id: ${courseId}`)

  const systemPrompt = `You are a curriculum analyst. Given a course syllabus, extract the weekly topics and return ONLY a JSON object (no markdown, no prose) in exactly this shape:

{
  "topics": [
    { "week": 1, "title": "Concise Topic Name", "description": "1-2 sentences describing what students learn this week." },
    ...
  ]
}

Rules:
- "title" must be 2-6 words.
- "description" must be 1-2 sentences.
- If the syllabus explicitly maps topics to weeks (e.g. "Week 1: ..."), honor those mappings exactly.
- If the syllabus is a flat topic list with no week labels, distribute topics across 10-14 weeks. Group related or short topics together into the same week. Keep week numbers sequential starting at 1. Aim for a realistic semester schedule — avoid 30 separate single-topic weeks.
- Output ONLY the JSON object. No explanation, no code fences.`

  let rawContent: string
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: syllabusText }],
    })

    const block = response.content[0]
    if (block.type !== 'text') {
      throw new Error('Unexpected non-text response block from Claude')
    }
    rawContent = block.text
  } catch (err) {
    console.error(`[ERROR] ${filename}: Claude API call failed —`, err)
    return
  }

  let topics: Topic[]
  try {
    topics = parseTopicsFromResponse(rawContent)
  } catch (err) {
    console.error(`[ERROR] ${filename}: failed to parse Claude response —`, err)
    console.error('Raw response:\n', rawContent)
    return
  }

  console.log(`  Extracted ${topics.length} topics`)

  // Idempotency: delete existing rows for this course before inserting
  const { error: deleteError } = await supabaseAdmin
    .from('topics')
    .delete()
    .eq('course_id', courseId)

  if (deleteError) {
    console.error(`[ERROR] ${filename}: failed to delete existing topics —`, deleteError.message)
    return
  }

  const rows = topics.map(t => ({
    course_id:   courseId,
    week:        t.week,
    title:       t.title,
    description: t.description,
  }))

  const { error: insertError } = await supabaseAdmin.from('topics').insert(rows)

  if (insertError) {
    console.error(`[ERROR] ${filename}: insert failed —`, insertError.message)
    return
  }

  console.log(`  [OK] Inserted ${rows.length} topics for ${courseId}`)
}

async function main() {
  for (const [filename, courseId] of Object.entries(COURSE_MAP)) {
    try {
      await extractTopics(filename, courseId)
    } catch (err) {
      console.error(`[FATAL] Unexpected error processing ${filename}:`, err)
    }
  }
  console.log('\nDone.')
}

main()
