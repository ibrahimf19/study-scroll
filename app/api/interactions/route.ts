import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const deviceId = searchParams.get('deviceId')
    const courseId = searchParams.get('courseId')

    const { data, error } = await supabaseAdmin
      .from('interactions')
      .select('video_id, type')
      .eq('device_id', deviceId)
      .eq('course_id', courseId)

    if (error) throw error

    const likes = (data ?? []).filter(r => r.type === 'like').map(r => r.video_id)
    const saves = (data ?? []).filter(r => r.type === 'save').map(r => r.video_id)

    return NextResponse.json({ likes, saves })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
