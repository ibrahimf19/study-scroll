import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Course = {
  id: string
  name: string
  code: string
  university: string
}

export default async function Home() {
  let courses: Course[] = []

  try {
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, code, university')
      .limit(20)

    if (!error && data) {
      courses = data
    }
  } catch {
    // Supabase not configured yet — fall through to empty state
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-10">
      <h1 className="text-3xl font-bold mb-2 tracking-tight">Study Scroll</h1>
      <p className="text-zinc-400 mb-10 text-sm">
        Short-form video, curated by your course.
      </p>

      {courses.length === 0 ? (
        <p className="text-zinc-500 text-center mt-24">No courses yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                href={`/feed/${course.id}`}
                className="block bg-zinc-900 rounded-2xl px-6 py-5 active:bg-zinc-800 transition-colors"
              >
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest">
                  {course.university}
                </span>
                <p className="mt-1 text-lg font-semibold leading-snug">
                  {course.name}
                </p>
                <p className="text-zinc-500 text-sm mt-0.5">{course.code}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
