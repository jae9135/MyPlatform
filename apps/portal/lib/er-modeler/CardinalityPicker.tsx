"use client";

import { normalizeCardinality, type RelationCardinality } from "./types";

/** 이미지·관계창·연결 도구 공통 카디널리티 목록 (위→아래) */
export const CARDINALITY_OPTIONS: RelationCardinality[] = [
  "1:0..1",
  "1:0..N",
  "1:1",
  "1:1..N",
  "0..1:1",
  "0..N:1",
  "1..N:1",
  "N:N",
];

function splitCard(card: string): [string, string] {
  const idx = card.indexOf(":");
  if (idx < 0) return ["1", "1..N"];
  return [card.slice(0, idx), card.slice(idx + 1)];
}

function MarkGlyph({ side }: { side: string }) {
  const t = side.trim().toUpperCase();
  const many = t.includes("N") || t === "*";
  const optional = t.includes("0");
  const w = 14;
  const h = 16;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="er-card-mark">
      <line x1={w / 2} y1={2} x2={w / 2} y2={h - 2} stroke="currentColor" strokeWidth="1.4" />
      {optional ? (
        <circle cx={w / 2} cy={h - 3} r="2.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
      ) : null}
      {many ? (
        <>
          <line x1={2} y1={4} x2={w - 2} y2={4} stroke="currentColor" strokeWidth="1.2" />
          <line x1={3} y1={6.5} x2={w - 3} y2={6.5} stroke="currentColor" strokeWidth="1.2" />
          <line x1={4} y1={9} x2={w - 4} y2={9} stroke="currentColor" strokeWidth="1.2" />
        </>
      ) : (
        <line x1={2} y1={5} x2={w - 2} y2={5} stroke="currentColor" strokeWidth="1.4" />
      )}
    </svg>
  );
}

function CardinalityDiagram({ value }: { value: string }) {
  const [left, right] = splitCard(value);
  return (
    <span className="er-card-diagram" aria-hidden>
      <MarkGlyph side={left} />
      <span className="er-card-diagram-line" />
      <MarkGlyph side={right} />
    </span>
  );
}

type Props = {
  value: RelationCardinality | string;
  onChange: (value: RelationCardinality) => void;
  compact?: boolean;
  label?: string;
};

export function CardinalityPicker({ value, onChange, compact, label }: Props) {
  const current = normalizeCardinality(value);

  return (
    <div className={`er-card-picker${compact ? " compact" : ""}`}>
      {label ? <span className="er-card-picker-label">{label}</span> : null}
      <ul className="er-card-picker-list" role="listbox" aria-label="관계 카디널리티">
        {CARDINALITY_OPTIONS.map((opt) => {
          const active = opt === current;
          return (
            <li key={opt}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={`er-card-picker-item${active ? " active" : ""}`}
                onClick={() => onChange(opt)}
              >
                <CardinalityDiagram value={opt} />
                <span className="er-card-picker-text">{opt}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function splitCardinalityDisplay(card: string): [string, string] {
  return splitCard(normalizeCardinality(card));
}
