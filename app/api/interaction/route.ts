import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { deviceId, videoId, courseId, type, action } = await req.json()

    if (action === 'add') {
      const { error } = await supabaseAdmin
        .from('interactions')
        .upsert(
          { device_id: deviceId, video_id: videoId, course_id: courseId, type },
          { onConflict: 'device_id,video_id,type' }
        )
      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from('interactions')
        .delete()
        .eq('device_id', deviceId)
        .eq('video_id', videoId)
        .eq('type', type)
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
