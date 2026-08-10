// サイドバーの折りたたみセクション

import { useState, type ReactNode } from 'react'

export function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string
  badge?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-ink/5">
      <button
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-page"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-[12px] font-semibold text-ink">
          {title}
          {badge && <span className="ml-2 rounded bg-page px-1.5 py-0.5 text-[10px] font-medium text-ink2">{badge}</span>}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`}>
          <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="space-y-3 px-4 pb-4 pt-0.5">{children}</div>}
    </section>
  )
}
