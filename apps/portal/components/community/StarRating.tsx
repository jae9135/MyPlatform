"use client";

/** 별점 표시 (읽기 전용) */
export function Stars({ value, label }: { value: number; label?: string }) {
  const full = Math.round(value);
  return (
    <span className="cm-stars" aria-label={label ?? `별점 ${value}점 / 5점`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= full ? undefined : "off"} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

/** 별점 입력 (1~5) */
export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <span className="cm-star-input" role="radiogroup" aria-label="별점 선택">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}점`}
          className={n <= value ? "on" : undefined}
          onClick={() => onChange(n)}
          disabled={disabled}
        >
          ★
        </button>
      ))}
    </span>
  );
}
