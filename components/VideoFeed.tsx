'use client'

import { useEffect, useState } from 'react'
import VideoCard from './VideoCard'
import { getDeviceId } from '@/lib/deviceId'

export type VideoEntry = {
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

export default function VideoFeed({ videos, courseId }: { videos: VideoEntry[]; courseId: string }) {
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const deviceId = getDeviceId()
    fetch(`/api/interactions?deviceId=${deviceId}&courseId=${courseId}`)
      .then(r => r.json())
      .then(({ likes, saves }: { likes: string[]; saves: string[] }) => {
        setLikedIds(new Set(likes))
        setSavedIds(new Set(saves))
      })
      .catch(() => {})
  }, [courseId])

  async function handleInteraction(
    videoId: string,
    vidCourseId: string,
    type: 'like' | 'save',
    currentlyActive: boolean,
  ) {
    const deviceId = getDeviceId()

    // Optimistic update
    if (type === 'like') {
      setLikedIds(prev => {
        const next = new Set(prev)
        currentlyActive ? next.delete(videoId) : next.add(videoId)
        return next
      })
    } else {
      setSavedIds(prev => {
        const next = new Set(prev)
        currentlyActive ? next.delete(videoId) : next.add(videoId)
        return next
      })
    }

    const res = await fetch('/api/interaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        videoId,
        courseId: vidCourseId,
        type,
        action: currentlyActive ? 'remove' : 'add',
      }),
    })

    if (!res.ok) {
      // Revert on failure
      if (type === 'like') {
        setLikedIds(prev => {
          const next = new Set(prev)
          currentlyActive ? next.add(videoId) : next.delete(videoId)
          return next
        })
      } else {
        setSavedIds(prev => {
          const next = new Set(prev)
          currentlyActive ? next.add(videoId) : next.delete(videoId)
          return next
        })
      }
    }
  }

  return (
    <div
      data-feed-root=""
      className="feed-scroll flex-1 w-full overflow-y-scroll snap-y snap-mandatory bg-black"
      style={{ scrollbarWidth: 'none' } as React.CSSProperties}
    >
      <style>{`
        .feed-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      {videos.map(video => (
        <VideoCard
          key={`${video.videoId}-${video.topicTitle}`}
          video={video}
          isLiked={likedIds.has(video.videoId)}
          isSaved={savedIds.has(video.videoId)}
          onLike={() => handleInteraction(video.videoId, video.courseId, 'like', likedIds.has(video.videoId))}
          onSave={() => handleInteraction(video.videoId, video.courseId, 'save', savedIds.has(video.videoId))}
        />
      ))}
    </div>
  )
}
