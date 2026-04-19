export function SifterLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 40"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4 3 L32 3 Q36 3 36 7 L23 23 L13 23 L0 7 Q0 3 4 3 Z"
        fill="#8B5CF6"
      />
      <rect
        x="11"
        y="26"
        width="14"
        height="11"
        rx="2"
        className="fill-[#3B3852] dark:fill-[#4E4B6A]"
      />
    </svg>
  );
}
