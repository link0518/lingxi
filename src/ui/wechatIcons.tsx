type IconProps = { className?: string };

export function IconChat({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7.5 18.2c-2.7-1.6-4.5-4.2-4.5-7.2C3 6 7 3 12 3s9 3 9 8-4 8-9 8c-1.1 0-2.1-.1-3.1-.4l-2.9 1.4c-.5.2-1-.2-.9-.8l.4-2.0z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8.2 11.2h.01M12 11.2h.01M15.8 11.2h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconContacts({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 11a4 4 0 1 0-0.001-8.001A4 4 0 0 0 9 11z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M2.8 20.5c.9-4 3.6-6.2 6.2-6.2s5.3 2.2 6.2 6.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M16.6 8.2c1.8.2 3.2 1.6 3.2 3.5 0 2-1.6 3.6-3.6 3.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M15.8 14.6c1.6.6 3.1 2.1 3.7 5.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconMoments({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 6.8c0-1 .8-1.8 1.8-1.8h8.4c1 0 1.8.8 1.8 1.8v10.4c0 1-.8 1.8-1.8 1.8H7.8c-1 0-1.8-.8-1.8-1.8V6.8z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 14.8l2.2-2.3 2.2 2.2 3.5-3.7 2.1 2.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M9.2 9.2h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconMe({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 12a4.2 4.2 0 1 0 0-8.4A4.2 4.2 0 0 0 12 12z" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4 20.2c1.1-4.6 4.2-7 8-7s6.9 2.4 8 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

