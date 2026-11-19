import type { BrandLogoId } from "@/types/orion";

export function BrandMark({
  logoId = "nexo",
  tone = "light",
  className = "h-9 w-9",
}: {
  logoId?: BrandLogoId;
  tone?: "light" | "dark";
  className?: string;
}) {
  const primary = tone === "light" ? "#F7F8FA" : "#173D4A";
  const accent = "#B99555";

  switch (logoId) {
    case "apice":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
          <path d="M10 38L24 10L38 38" stroke={primary} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 31H31" stroke={accent} strokeWidth="3" strokeLinecap="round" />
          <circle cx="24" cy="10" r="3" fill={accent} />
          <rect x="8" y="40" width="32" height="2.4" rx="1.2" fill={primary} fillOpacity="0.4" />
        </svg>
      );

    case "prisma":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
          <polygon points="24,6 42,24 24,42 6,24" stroke={primary} strokeWidth="3" strokeLinejoin="round" />
          <path d="M24 6V42M6 24H42" stroke={primary} strokeOpacity="0.32" strokeWidth="1.6" />
          <polygon points="24,15 33,24 24,33 15,24" fill={accent} />
        </svg>
      );

    case "vortice":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
          <path d="M8 28C14 14 27 11 40 16" stroke={accent} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M10 35C18 24 30 22 41 25" stroke={primary} strokeWidth="3" strokeLinecap="round" />
          <path d="M36 12L42 16L37 21" stroke={accent} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case "orbita":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
          <path
            d="M37 15A15 15 0 1 0 39 24"
            stroke={primary}
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <circle cx="24" cy="24" r="6" stroke={accent} strokeWidth="2.8" />
          <circle cx="24" cy="24" r="2.2" fill={accent} />
          <circle cx="37" cy="15" r="2.8" fill={accent} />
        </svg>
      );

    case "nexo":
    default:
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
          <path d="M10 34L22 22L36 13" stroke={accent} strokeWidth="2.8" strokeLinecap="round" />
          <path d="M10 15L22 22L35 33" stroke={primary} strokeOpacity="0.7" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="10" cy="34" r="3.4" fill={primary} />
          <circle cx="10" cy="15" r="3" fill={primary} />
          <circle cx="22" cy="22" r="4.2" fill={accent} />
          <circle cx="36" cy="13" r="3.8" fill={accent} />
          <circle cx="35" cy="33" r="3" fill={primary} />
        </svg>
      );
  }
}

export function BrandLogo({
  logoId = "nexo",
  tone = "light",
}: {
  logoId?: BrandLogoId;
  tone?: "light" | "default";
}) {
  const isLight = tone === "light";
  return (
    <div className="flex items-center gap-2.5 select-none">
      <BrandMark
        logoId={logoId}
        tone={isLight ? "light" : "dark"}
        className="h-9 w-9 shrink-0"
      />
      <div className="min-w-0 leading-tight">
        <div
          className={`font-serif text-xl font-semibold tracking-[0.07em] ${isLight ? "text-white" : "text-[#0C1928]"}`}
        >
          ÓRION
        </div>
        <div className={`text-[10px] tracking-wide ${isLight ? "text-[#d8e0e5]" : "text-[#52616a]"}`}>
          Gestão patrimonial e rotina
        </div>
      </div>
    </div>
  );
}
