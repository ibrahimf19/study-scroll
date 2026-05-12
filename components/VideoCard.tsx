'use client'

import { useEffect, useRef, useState } from 'react'
import type { VideoEntry } from './VideoFeed'

export default function VideoCard({ video }: { video: VideoEntry }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.5 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const videoId = video.videoId
  const iframeSrc =
    `https://www.youtube-nocookie.com/embed/${videoId}` +
    `?autoplay=1&controls=0&modestbranding=1&playsinline=1&rel=0&mute=1` +
    `&loop=1&playlist=${videoId}&iv_load_policy=3&disablekb=1&fs=0&showinfo=0&cc_load_policy=0`

  return (
    <div
      ref={cardRef}
      className="h-[100dvh] w-full snap-start flex items-center justify-center bg-black relative"
    >
      {/* 9:16 play area */}
      <div className="relative w-full max-w-[420px] mx-auto aspect-[9/16] bg-black overflow-hidden">
        {inView ? (
          <iframe
            src={iframeSrc}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen={false}
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Transparent click blocker — sits above iframe (z-10), below bottom overlay (z-20).
            touch-action: pan-y lets vertical swipes pass through to the scroll-snap container. */}
        <div
          className="absolute inset-0 z-10"
          style={{ touchAction: 'pan-y' }}
        />

        {/* Bottom overlay */}
        <div
          className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-16 z-20"
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
