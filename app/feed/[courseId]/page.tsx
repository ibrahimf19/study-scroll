export const revalidate = 0

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import VideoFeed from '@/components/VideoFeed'

type VideoEntry = {
  videoId: string
  courseId: string
  title: string
  channel: string
  thumbnailUrl: string
  durationSeconds: number
  week: number
  topicTitle: string
  score: number
}

type ScoreRow = {
  course_id: string
  relevance_score: number
  videos: {
    id: string
    title: string
    channel: string | null
    thumbnail_url: string | null
    duration_seconds: number
  } | null
  topics: { week: number; title: string } | null
}

export default async function FeedPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params

  const { data: course } = await supabaseAdmin
    .from('courses')
    .select('id, name, code, university')
    .eq('id', courseId)
    .single()

  if (!course) notFound()

  const { data: rows } = await supabaseAdmin
    .from('video_scores')
    .select(`
      course_id,
      relevance_score,
      videos (id, title, channel, thumbnail_url, duration_seconds),
      topics (week, title)
    `)
    .eq('course_id', courseId)
    .gte('relevance_score', 70)
    .order('relevance_score', { ascending: false })
    .limit(30)

  const videos: VideoEntry[] = ((rows as unknown as ScoreRow[]) ?? [])
    .filter(r => r.videos && r.topics)
    .map(r => ({
      videoId:         r.videos!.id,
      courseId:        r.course_id,
      title:           r.videos!.title,
      channel:         r.videos!.channel ?? 'Unknown',
      thumbnailUrl:    r.videos!.thumbnail_url ?? '',
      durationSeconds: r.videos!.duration_seconds,
      week:            r.topics!.week,
      topicTitle:      r.topics!.title,
      score:           r.relevance_score,
    }))

  return (
    <div className="flex flex-col h-[100dvh] bg-black overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur-sm z-20 shrink-0 border-b border-white/5">
        <Link
          href="/"
          className="text-zinc-400 hover:text-white transition-colors p-1 -ml-1"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="text-xs text-zinc-500 uppercase tracking-widest leading-none mb-0.5">
            {course.university}
          </p>
          <h1 className="text-white font-semibold text-sm leading-tight truncate">
            {course.name}
          </h1>
        </div>
      </div>

      {/* Feed */}
      {videos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500 text-sm">No videos yet for this course.</p>
        </div>
      ) : (
        <VideoFeed videos={videos} courseId={courseId} />
      )}
    </div>
  )
}
