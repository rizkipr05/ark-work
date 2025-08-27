'use client';

import Link from 'next/link';
import Nav from '@/components/nav';
import Footer from '@/components/Footer';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type LocalJob = {
  id: number | string;
  title: string;
  company: string;
  location: string;
  type: 'full_time' | 'part_time' | 'contract' | 'internship';
  remote?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string;
  deadline?: string | null;
  tags?: string[];
  description?: string;
  requirements?: string;
  postedAt?: string;
  status?: 'active' | 'closed';
  logo?: string | null;
};

const LS_KEY = 'ark_jobs';

export default function EmployerJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<LocalJob[]>([]);

  useEffect(() => {
    load();
    const onUpd = () => load();
    window.addEventListener('ark:jobs-updated', onUpd);
    return () => window.removeEventListener('ark:jobs-updated', onUpd);
  }, []);

  function load() {
    try {
      const arr: LocalJob[] = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
      arr.sort((a, b) => new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime());
      setJobs(arr);
    } catch {
      setJobs([]);
    }
  }

  function save(next: LocalJob[]) {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setJobs(next);
    window.dispatchEvent(new Event('ark:jobs-updated'));
  }

  function toggleStatus(id: LocalJob['id']) {
    const next = jobs.map((j) => {
      if (String(j.id) !== String(id)) return j;
      const nextStatus: LocalJob['status'] =
        (j.status ?? 'active') === 'active' ? 'closed' : 'active';
      return { ...j, status: nextStatus };
    });
    save(next);
  }

  function removeJob(id: LocalJob['id']) {
    if (!confirm('Hapus lowongan ini?')) return;
    save(jobs.filter((j) => String(j.id) !== String(id)));
  }

  return (
    <>
      <Nav />
      <main className="min-h-[60vh] bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6 flex items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
              <p className="text-sm text-slate-600">Kelola lowongan yang sedang tayang.</p>
            </div>
            <Link
              href="/employer/jobs/new"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Post a Job
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Posisi</th>
                  <th className="px-4 py-3">Perusahaan</th>
                  <th className="px-4 py-3">Lokasi</th>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Diposting</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const isClosed = (j.status ?? 'active') === 'closed';
                  return (
                    <tr
                      key={j.id}
                      className={`border-b last:border-0 ${
                        isClosed ? 'bg-slate-100 text-slate-400' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        {isClosed ? <s>{j.title}</s> : j.title}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {j.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={j.logo}
                              alt={j.company}
                              className="h-6 w-6 rounded object-cover"
                            />
                          ) : (
                            <div className="grid h-6 w-6 place-items-center rounded bg-slate-200 text-[10px] font-semibold">
                              {initials(j.company || 'CO')}
                            </div>
                          )}
                          <span>{isClosed ? <s>{j.company}</s> : j.company}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{j.location} {j.remote ? '• Remote' : ''}</td>
                      <td className="px-4 py-3">{mapType(j.type)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            isClosed
                              ? 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700'
                              : 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                          }
                        >
                          {isClosed ? 'inactive' : 'active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatDate(j.postedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/employer/jobs/new?id=${j.id}`}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => toggleStatus(j.id)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
                          >
                            {isClosed ? 'Buka lagi' : 'Tutup'}
                          </button>
                          <button
                            onClick={() => removeJob(j.id)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-700 hover:bg-rose-100"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {jobs.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-slate-600" colSpan={7}>
                      Belum ada lowongan. Klik <b>Post a Job</b> untuk mulai mempublikasikan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

/* ---------------- Utils ---------------- */
function mapType(t: LocalJob['type']) {
  switch (t) {
    case 'part_time':
      return 'Part-time';
    case 'contract':
      return 'Contract';
    case 'internship':
      return 'Internship';
    default:
      return 'Full-time';
  }
}

function formatDate(iso?: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
