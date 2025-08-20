'use client'
import { useAuth } from '@/hooks/useAuth'
import { useEffect, useState } from 'react'

export default function Applications() {
  const { user } = useAuth()
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    if (!user) { window.location.href='/auth/signin'; return }
    const apps = JSON.parse(localStorage.getItem('ark_apps') ?? '{}')[user.email] ?? []
    const jobs = JSON.parse(localStorage.getItem('ark_jobs') ?? '[]')
    const r = apps.map((a:any)=>({ ...a, title: jobs.find((j:any)=>j.id===a.jobId)?.title ?? `Job ${a.jobId}`, location: jobs.find((j:any)=>j.id===a.jobId)?.location ?? '-' }))
    setRows(r)
  }, [user])

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-brand-blue mb-8">My Applications</h1>
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applied On</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.length===0 ? (
                  <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">No applications yet</td></tr>
                ) : rows.map((r,i)=>(
                  <tr key={i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Under Review</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
