export const PET_APPEARANCES = [
  { id: "hedgehog", label: "Hedgehog", coat: "#567c6c", detail: "#3f6556", face: "#f2e6cf" },
  { id: "fox", label: "Fox", coat: "#d66a2c", detail: "#9b3f27", face: "#fff0d5" },
  { id: "bunny", label: "Bunny", coat: "#d6b8a3", detail: "#b98e85", face: "#f5e9dd" },
  { id: "frog", label: "Frog", coat: "#69a77b", detail: "#46855f", face: "#d6efc5" },
  { id: "shark", label: "Shark", coat: "#6894a8", detail: "#3d6d83", face: "#e8f4ef" },
  { id: "kenny", label: "Kenny", coat: "#ed7a21", detail: "#b64d18", face: "#e8b47c" },
  { id: "spongebob", label: "SpongeBob", coat: "#f4cf3c", detail: "#d6a92b", face: "#fff9d7" },
  { id: "patrick", label: "Patrick", coat: "#ed8f9d", detail: "#cc6878", face: "#fff0d7" },
  { id: "plankton", label: "Plankton", coat: "#65b43d", detail: "#347e35", face: "#d9ef9e" },
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
          <path d="M43 39 Q51 31 61 35 Q58 44 46 47 L39 44Z" fill="var(--pet-detail)" />
          <path d="M54 36 Q59 34 61 35 Q58 41 52 43Z" fill="var(--pet-face)" />
          <path d="M8 35L10 4 28 19 Q33 17 37 19L55 4 57 35 Q54 48 32 50 Q11 47 8 35Z" fill="var(--pet-coat)" />
          <path d="M13 22L12 9 24 20ZM43 20L54 9 53 23Z" fill="#f2a078" />
          <path d="M17 31Q24 24 32 28Q40 24 49 31L46 40Q39 46 32 45Q24 45 19 40Z" fill="var(--pet-face)" />
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
      {appearance === "shark" && (
        <>
          <path d="M12 31L2 21L5 39L14 37Z" fill="var(--pet-detail)" />
          <path d="M25 19L31 5L39 20Z" fill="var(--pet-detail)" />
          <path d="M22 39L15 51L34 43Z" fill="var(--pet-detail)" />
          <path d="M10 28Q15 16 32 16Q49 16 56 28L60 32L55 36Q52 46 40 47H20Q9 44 10 28Z" fill="var(--pet-coat)" />
          <path d="M15 35Q29 40 55 33Q52 45 40 47H20Q13 44 15 35Z" fill="var(--pet-face)" />
          {sleepy
            ? <path d="M42 27q3 2 5 0" stroke="#263c49" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            : <circle cx="43" cy="27" r="2.3" fill="#263c49" />}
          <path d="M47 36L50 40L53 35L56 38L58 33" fill="#fff" stroke="#8eb4bf" strokeWidth=".8" strokeLinejoin="round" />
          <path d="M31 26v5m5-6v5" stroke="#3d6d83" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
      {appearance === "kenny" && (
        <>
          <path d="M11 48Q7 35 10 23Q11 7 32 6Q53 7 54 23L57 48Q47 53 32 52Q17 53 11 48Z" fill="var(--pet-coat)" />
          <path d="M16 31Q16 17 32 16Q48 17 48 31L43 39H21Z" fill="#6a3824" />
          <path d="M20 30Q21 20 32 20Q43 20 44 30L40 36H24Z" fill="var(--pet-face)" />
          {sleepy
            ? <path d="M25 28q3 2 5 0m5 0q3 2 5 0" stroke="#35251d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            : <g fill="#35251d"><ellipse cx="28" cy="28" rx="2.1" ry="2.8" /><ellipse cx="38" cy="28" rx="2.1" ry="2.8" /></g>}
          <path d="M18 42L23 45M46 42L41 45M32 39v7" stroke="#ffe1a9" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M13 48Q32 44 54 48" fill="none" stroke="var(--pet-detail)" strokeWidth="2" />
        </>
      )}
      {appearance === "spongebob" && (
        <>
          <path d="M13 10Q18 8 23 10L29 8L35 10L42 8L49 11L52 18L50 25L53 33L50 40L52 49H12L14 41L11 34L14 27L11 19Z" fill="var(--pet-coat)" stroke="#d3a627" strokeWidth="1.5" />
          <circle cx="18" cy="20" r="1.4" fill="#d99e25" /><circle cx="46" cy="17" r="1.2" fill="#d99e25" />
          <circle cx="17" cy="34" r="1.6" fill="#d99e25" /><circle cx="47" cy="31" r="1.5" fill="#d99e25" />
          <path d="M13 38Q31 35 51 38V46H13Z" fill="#fffdf0" />
          <path d="M13 45H51L49 52H15Z" fill="#8e552e" />
          <path d="M19 23Q18 14 25 14Q32 14 32 23V30H19ZM33 23Q33 14 40 14Q47 14 46 23V30H33Z" fill="#fff" stroke="#dfad27" strokeWidth="1" />
          {sleepy
            ? <path d="M21 26q4 3 8 0m6 0q4 3 8 0" stroke="#263843" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            : <g><circle cx="26" cy="23" r="3" fill="#4295bd" /><circle cx="39" cy="23" r="3" fill="#4295bd" /><circle cx="26" cy="23" r="1.5" fill="#263843" /><circle cx="39" cy="23" r="1.5" fill="#263843" /></g>}
          <path d="M31 22L33 31" stroke="#d99e25" strokeWidth="2" strokeLinecap="round" />
          <path d="M23 33Q32 40 42 32Q40 41 33 41Q26 41 23 33Z" fill="#7d3f36" />
          <path d="M29 34H34V38H29Z" fill="#fff" />
        </>
      )}
      {appearance === "patrick" && (
        <>
          <path d="M32 5L40 21L57 18L48 33L55 48L37 45L27 54L24 40L8 36L22 27L19 12L31 20Z" fill="var(--pet-coat)" stroke="#cf6e80" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M16 36Q32 40 50 34L53 46Q33 53 14 45Z" fill="#66a34e" />
          <path d="M22 39q3-4 6 0q-3 4-6 0m14 2q3-4 6 0q-3 4-6 0" fill="#a95f93" />
          {sleepy
            ? <path d="M25 28q3 2 6 0m5 0q3 2 6 0" stroke="#413337" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            : <g fill="#413337"><ellipse cx="28" cy="27" rx="2" ry="3" /><ellipse cx="39" cy="27" rx="2" ry="3" /></g>}
          <path d="M27 34Q33 39 40 33" fill="none" stroke="#8b4555" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="21" cy="32" r="2" fill="#efb0ab" /><circle cx="46" cy="31" r="2" fill="#efb0ab" />
        </>
      )}
      {appearance === "plankton" && (
        <>
          <path d="M26 18Q24 8 19 5M38 18Q42 8 48 6" fill="none" stroke="#347e35" strokeWidth="2" strokeLinecap="round" />
          <circle cx="19" cy="5" r="2" fill="#65b43d" /><circle cx="48" cy="6" r="2" fill="#65b43d" />
          <path d="M22 21Q32 14 43 21Q50 28 45 42Q41 50 30 49Q19 48 17 38Q15 27 22 21Z" fill="var(--pet-coat)" stroke="#347e35" strokeWidth="1.5" />
          <path d="M25 27Q33 20 42 27Q43 37 35 41Q27 39 25 27Z" fill="#f35e55" />
          {sleepy
            ? <path d="M27 29q5 4 11 0" stroke="#283b33" strokeWidth="2" fill="none" strokeLinecap="round" />
            : <ellipse cx="34" cy="31" rx="3.8" ry="5.2" fill="#283b33" />}
          <circle cx="35" cy="29" r="1.2" fill="#fff4d4" />
          <path d="M22 43L16 50M28 47L26 53M40 47L43 53M45 42L52 48" stroke="#347e35" strokeWidth="2" strokeLinecap="round" />
          <path d="M27 43q6 3 12-1" fill="none" stroke="#347e35" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {(["hedgehog", "fox", "bunny", "frog"] as const).includes(appearance as "hedgehog" | "fox" | "bunny" | "frog") && (
        <>
          {appearance !== "fox" && <path d="M11 43Q13 29 31 28Q50 28 55 43L53 48Q33 54 13 48Z" fill="var(--pet-face)" />}
          {sleepy ? (
            <path d="M24 39q4 3 8 0m7 0q4 3 8 0" stroke="#293b3d" strokeWidth="2" fill="none" strokeLinecap="round" />
          ) : (
            <g fill="#293b3d">
              <circle cx="28" cy="37" r="2.5" /><circle cx="43" cy="37" r="2.5" />
              <circle cx="29" cy="36" r=".8" fill="#fff8ec" /><circle cx="44" cy="36" r=".8" fill="#fff8ec" />
            </g>
          )}
          <circle cx="35.5" cy="42" r="2" fill={appearance === "fox" ? "#55352b" : "#b76845"} />
          {appearance !== "fox" && (
            <>
              <ellipse cx="20" cy="42" rx="3" ry="2" fill="#e9a990" opacity=".62" />
              <ellipse cx="51" cy="42" rx="3" ry="2" fill="#e9a990" opacity=".62" />
            </>
          )}
          <ellipse cx="20" cy="49" rx="5" ry="2.5" fill="var(--pet-detail)" />
          <ellipse cx="46" cy="49" rx="5" ry="2.5" fill="var(--pet-detail)" />
        </>
      )}
    </svg>
  );
}
