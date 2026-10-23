export const PET_APPEARANCES = [
  { id: "hedgehog", label: "Hedgehog", coat: "#567c6c", detail: "#3f6556", face: "#f2e6cf" },
  { id: "fox", label: "Fox", coat: "#c97842", detail: "#9b5939", face: "#f4e4c8" },
  { id: "bunny", label: "Bunny", coat: "#d6b8a3", detail: "#b98e85", face: "#f5e9dd" },
  { id: "frog", label: "Frog", coat: "#69a77b", detail: "#46855f", face: "#d6efc5" },
] as const;

export type PetAppearance = typeof PET_APPEARANCES[number]["id"];

export function isPetAppearance(value: unknown): value is PetAppearance {
  return PET_APPEARANCES.some((appearance) => appearance.id === value);
}

export function PetSprite({
  appearance,
  sleepy = false,
  className,
}: {
  appearance: PetAppearance;
  sleepy?: boolean;
  className?: string;
}) {
  const look = PET_APPEARANCES.find((choice) => choice.id === appearance) ?? PET_APPEARANCES[0];

  return (
    <svg
      className={className}
      viewBox="0 0 64 56"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      style={{ ["--pet-coat" as string]: look.coat, ["--pet-detail" as string]: look.detail, ["--pet-face" as string]: look.face }}
    >
      {appearance === "hedgehog" && (
        <>
          <path d="M6 44 Q4 14 30 10 Q52 10 56 36 L58 44Z" fill="var(--pet-coat)" />
          <g fill="var(--pet-detail)">
            <path d="M10 26l4-9 4 9z" /><path d="M18 18l4-9 4 9z" /><path d="M27 15l4-9 4 9z" />
            <path d="M36 16l4-8 4 9z" /><path d="M44 21l4-7 4 9z" />
          </g>
        </>
      )}
      {appearance === "fox" && (
        <>
          <path d="M43 37 Q53 30 60 37 Q55 45 45 44Z" fill="var(--pet-detail)" />
          <path d="M13 28L11 8 27 19 Q37 16 47 19L56 7 56 31 Q54 44 33 47 Q15 44 13 28Z" fill="var(--pet-coat)" />
          <path d="M15 22L14 12 24 21M47 21L54 12 53 24" fill="var(--pet-face)" />
        </>
      )}
      {appearance === "bunny" && (
        <>
          <path d="M20 25Q10 5 17 2Q26 2 30 23Z" fill="var(--pet-detail)" />
          <path d="M38 23Q40 1 49 3Q56 8 45 28Z" fill="var(--pet-detail)" />
          <path d="M24 23Q16 7 19 7Q24 9 27 23ZM40 23Q43 8 48 8Q50 11 43 25Z" fill="#edd2c8" />
          <path d="M10 40Q10 20 31 19Q53 19 56 39L53 46H13Z" fill="var(--pet-coat)" />
        </>
      )}
      {appearance === "frog" && (
        <>
          <path d="M8 43Q8 22 32 22Q56 22 57 43L54 47H11Z" fill="var(--pet-coat)" />
          <circle cx="20" cy="20" r="10" fill="var(--pet-detail)" /><circle cx="45" cy="20" r="10" fill="var(--pet-detail)" />
          <circle cx="21" cy="19" r="5" fill="var(--pet-face)" /><circle cx="44" cy="19" r="5" fill="var(--pet-face)" />
        </>
      )}
      <path d="M11 43Q13 29 31 28Q50 28 55 43L53 48Q33 54 13 48Z" fill="var(--pet-face)" />
      {sleepy ? (
        <path d="M24 39q4 3 8 0m7 0q4 3 8 0" stroke="#293b3d" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : (
        <g fill="#293b3d">
          <circle cx="28" cy="37" r="2.5" /><circle cx="43" cy="37" r="2.5" />
          <circle cx="29" cy="36" r=".8" fill="#fff8ec" /><circle cx="44" cy="36" r=".8" fill="#fff8ec" />
        </g>
      )}
      <circle cx="35.5" cy="42" r="2" fill="#b76845" />
      <ellipse cx="20" cy="42" rx="3" ry="2" fill="#e9a990" opacity=".62" />
      <ellipse cx="51" cy="42" rx="3" ry="2" fill="#e9a990" opacity=".62" />
      <ellipse cx="20" cy="49" rx="5" ry="2.5" fill="var(--pet-detail)" />
      <ellipse cx="46" cy="49" rx="5" ry="2.5" fill="var(--pet-detail)" />
    </svg>
  );
}
