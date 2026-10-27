// Chat bubble with a handset, drawn in the same stroke style as Lucide icons.
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <path
        d="M15.6 13.9c-.3-.15-1.5-.75-1.7-.8-.25-.1-.4-.15-.6.15-.15.25-.65.8-.8.95-.15.15-.3.2-.55.05-.3-.15-1.2-.45-2.25-1.4-.85-.75-1.4-1.65-1.55-1.95-.15-.25 0-.4.1-.55l.4-.45c.15-.15.2-.25.3-.45.1-.15.05-.3 0-.45-.05-.1-.55-1.35-.75-1.85-.2-.5-.4-.4-.55-.4h-.5c-.15 0-.4.05-.6.3-.2.25-.8.8-.8 1.95s.8 2.25.95 2.4c.1.15 1.6 2.45 3.9 3.45 2.3 1 2.3.65 2.75.6.4-.05 1.4-.55 1.6-1.1.2-.55.2-1 .15-1.1-.05-.1-.2-.15-.45-.3z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}
