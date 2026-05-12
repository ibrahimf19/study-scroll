'use client'

import VideoCard from './VideoCard'

export type VideoEntry = {
  videoId: string
  title: string
  channel: string
  thumbnailUrl: string
  durationSeconds: number
  week: number
  topicTitle: string
  score: number
}

export default function VideoFeed({ videos }: { videos: VideoEntry[] }) {
  return (
    <div
      className="feed-scroll flex-1 w-full overflow-y-scroll snap-y snap-mandatory bg-black"
      style={{ scrollbarWidth: 'none' } as React.CSSProperties}
    >
      <style>{`
        .feed-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      {videos.map(video => (
        <VideoCard key={`${video.videoId}-${video.topicTitle}`} video={video} />
      ))}
    </div>
  )
}
