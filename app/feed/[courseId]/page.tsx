import { supabase } from '@/lib/supabase'

type Props = {
  params: Promise<{ courseId: string }>
}

export default async function FeedPage({ params }: Props) {
  const { courseId } = await params

  let courseName = 'Unknown Course'

  try {
    const { data, error } = await supabase
      .from('courses')
      .select('name')
      .eq('id', courseId)
      .single()

    if (!error && data) {
      courseName = data.name
    }
  } catch {
    // Supabase not configured yet
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-bold mb-3">{courseName}</h1>
      <p className="text-zinc-400">Feed coming soon.</p>
    </main>
  )
}
