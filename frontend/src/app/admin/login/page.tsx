'use client';

import { useState, FormEvent, ChangeEvent } from 'react'; // Impor tipe event
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth'; // Impor hook useAuth
import Image from 'next/image'; // Impor Image jika ingin pakai logo
import Link from 'next/link'; // Impor Link

// Ganti path logo jika berbeda atau hapus jika tidak pakai logo
import Logo from '@/app/Images/Ungu__1_-removebg-preview.png';

export default function AdminLoginPage() {
  const router = useRouter();
  const { signinAdmin } = useAuth(); // Ambil fungsi signinAdmin dari hook
  const [username, setUsername] = useState(''); // Ganti state menjadi username
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // Tambah state show password
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Ganti nama state busy -> isLoading

  async function handleAdminLogin(e: FormEvent<HTMLFormElement>) { // Tipe event
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validasi frontend sederhana
    if (!username.trim() || !password) {
      setError('Username dan password harus diisi.');
      setIsLoading(false);
      return;
    }

    try {
      // ==========================================================
      // PERUBAHAN UTAMA: Panggil fungsi dari hook useAuth
      // ==========================================================
      console.log(`[AdminLogin] Attempting login for username: ${username.trim()}`);
      await signinAdmin(username.trim(), password);
      // Hook useAuth akan:
      // 1. Memanggil POST /api/admin/signin
      // 2. Menerima respons & cookie
      // 3. Memperbarui state global 'user'
      // 4. Menyimpan snapshot ke localStorage

      console.log('[AdminLogin] signinAdmin successful, redirecting...');
      // Redirect ke dashboard admin utama setelah hook berhasil
      // Hook sudah memvalidasi, tidak perlu cek /api/admin/me lagi di sini
      router.push('/admin/dashboard'); // Arahkan ke dashboard spesifik
      router.refresh(); // Penting untuk memuat ulang layout/sidebar dengan state baru

    } catch (err: any) {
      // Tangani error yang dilempar oleh signinAdmin (termasuk 401, 400, 500)
      console.error("[AdminLogin] Login failed:", err);
      // Ambil pesan error dari hook atau error asli
      const errorMessage = err.message || "Login gagal. Periksa kembali username dan password Anda.";
      setError(errorMessage);
       // ** PENTING: JANGAN LAKUKAN FALLBACK KE /auth/signin DI SINI **

    } finally {
      setIsLoading(false);
    }
  }

  // --- JSX (Mirip struktur sebelumnya, tapi pakai state 'username') ---
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-12">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
         {/* Logo Opsional */}
         <Image
           src={Logo}
           alt="Logo"
           width={80}
           height={80}
           className="mx-auto mb-6 h-16 w-auto"
           priority
         />
        <h1 className="mb-6 text-center text-3xl font-bold text-gray-800">
          Admin Panel Login
        </h1>

        {error && (
          <div className="mb-4 rounded-md border border-red-400 bg-red-100 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleAdminLogin} noValidate className="space-y-6">
          <div>
            {/* Label dan Input untuk Username */}
            <label htmlFor="admin-username" className="mb-1 block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              value={username} // Gunakan state username
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} // Update state username
              required
              autoComplete="username"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Enter admin username" // Placeholder diubah
              aria-label="Admin Username" // Aria label diubah
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 pr-10 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                tabIndex={-1}
                aria-label="Toggle password visibility"
              >
                {showPassword ? '👁️' : '🙈'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`flex w-full items-center justify-center rounded-lg border border-transparent px-4 py-2.5 text-base font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              isLoading
                ? 'cursor-not-allowed bg-indigo-400'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="mr-2 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Logging in...
              </>
            ) : (
              'Login to Admin Panel'
            )}
          </button>
        </form>
         {/* Link kembali ke halaman login user biasa */}
         <p className="mt-6 text-center text-sm text-gray-600">
            Bukan admin?{' '}
            <Link href="/auth/signin" className="font-medium text-indigo-600 hover:text-indigo-500">
                Login sebagai User/Employer
            </Link>
         </p>
      </div>
    </div>
  );
}