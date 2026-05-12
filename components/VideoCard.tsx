'use client'

import { useEffect, useRef, useState } from 'react'
import { Heart, Bookmark } from 'lucide-react'
import type { VideoEntry } from './VideoFeed'

type Props = {
  video: VideoEntry
  isLiked: boolean
  isSaved: boolean
  onLike: () => void
  onSave: () => void
}

export default function VideoCard({ video, isLiked, isSaved, onLike, onSave }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [coverVisible, setCoverVisible] = useState(true)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const scrollRoot = el.closest('[data-feed-root]') as HTMLElement | null
    const observer = new IntersectionObserver(
      ([entry]) => {
        console.log('intersect', (entry.target as HTMLElement).dataset.videoId, entry.isIntersecting, entry.intersectionRatio)
        setInView(entry.isIntersecting)
      },
      { root: scrollRoot, rootMargin: '0px 0px 100% 0px', threshold: 0 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (inView) {
      setCoverVisible(true)
      const t = setTimeout(() => setCoverVisible(false), 1200)
      return () => clearTimeout(t)
    } else {
      setCoverVisible(true)
    }
  }, [inView])

  const videoId = video.videoId
  const iframeSrc =
    `https://www.youtube-nocookie.com/embed/${videoId}` +
    `?autoplay=1&controls=0&modestbranding=1&playsinline=1&rel=0&mute=1` +
    `&loop=1&playlist=${videoId}&iv_load_policy=3&disablekb=1&fs=0&showinfo=0&cc_load_policy=0`

  return (
    <div
      ref={cardRef}
      data-video-id={video.videoId}
      className="h-[100dvh] w-full snap-start flex items-center justify-center bg-black relative"
    >
      {/* 9:16 play area */}
      <div className="relative w-full max-w-[420px] mx-auto aspect-[9/16] bg-black overflow-hidden">
        {inView ? (
          <>
            <iframe
              src={iframeSrc}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen={false}
              className="absolute inset-0 w-full h-full border-0 z-0"
            />
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className={`absolute inset-0 w-full h-full object-cover z-10 transition-opacity duration-300 ${coverVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            />
          </>
        ) : (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Transparent click blocker — above thumbnail cover (z-20), below bottom overlay (z-30).
            touch-action: pan-y lets vertical swipes pass through to the scroll-snap container. */}
        <div
          className="absolute inset-0 z-20"
          style={{ touchAction: 'pan-y' }}
        />

        {/* Like / Save buttons */}
        <div className="absolute right-4 bottom-32 z-30 flex flex-col gap-6 pointer-events-auto">
          <button onClick={onLike} aria-label="Like">
            <Heart
              size={28}
              fill={isLiked ? '#ef4444' : 'none'}
              stroke={isLiked ? '#ef4444' : 'white'}
            />
          </button>
          <button onClick={onSave} aria-label="Save">
            <Bookmark
              size={28}
              fill={isSaved ? '#facc15' : 'none'}
              stroke={isSaved ? '#facc15' : 'white'}
            />
          </button>
        </div>

        {/* Bottom overlay */}
        <div
          className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-16 z-30"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
          }}
        >
          <p className="text-zinc-300 text-xs mb-1 truncate">{video.channel}</p>
          <p className="text-white text-sm font-semibold leading-snug line-clamp-2 mb-2">
            {video.title}
          </p>
          <span className="inline-block text-zinc-400 text-xs bg-white/10 rounded-full px-2.5 py-0.5">
            Week {video.week} · {video.topicTitle}
          </span>
        </div>
      </div>
    </div>
  )
}
