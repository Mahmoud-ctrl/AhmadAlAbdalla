import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-5xl font-bold font-mono text-[#E8231A] mb-4">404</p>
        <h1 className="text-lg font-semibold text-[#111111] mb-2">Page not found</h1>
        <p className="text-sm text-[#888888] mb-6">The page you are looking for does not exist.</p>
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-md bg-[#E8231A] px-5 text-sm font-medium text-white hover:bg-[#f03020] transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
