export function WorkflowConnectDiagram() {
  const centerX = 360;
  const centerW = 220;
  const textX = centerX + 58;
  const iconLeft = centerX + 16;
  const iconRight = centerX + centerW - 44;

  return (
    <svg
      className="mkt-flow-svg mkt-flow-svg-large"
      viewBox="0 0 980 210"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="테이블정의서에서 DB 표준 점검, DBManager, ER Modeler, Supabase로 이어지는 워크플로"
    >
      <defs>
        <linearGradient id="mktFlowNode" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eff6ff" />
        </linearGradient>
      </defs>

      {/* source */}
      <rect x="24" y="68" width="176" height="72" rx="12" fill="url(#mktFlowNode)" stroke="#bfdbfe" strokeWidth="1.5" />
      <g transform="translate(38, 88)" aria-hidden>
        <rect x="0" y="0" width="28" height="32" rx="4" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1" />
        <path d="M4 10h20M4 16h20M4 22h14" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 10h8v12H4z" fill="#93c5fd" opacity="0.5" />
      </g>
      <text x="74" y="100" fill="#1e40af" fontSize="13" fontWeight="700">
        테이블정의서
      </text>
      <text x="74" y="118" fill="#64748b" fontSize="11">
        .xlsx
      </text>
      <g transform="translate(158, 90)" aria-hidden>
        <rect x="0" y="0" width="26" height="32" rx="3" fill="#fff" stroke="#cbd5e1" strokeWidth="1" />
        <rect x="0" y="0" width="26" height="8" rx="3" fill="#22c55e" />
        <text x="13" y="24" fill="#64748b" fontSize="8" textAnchor="middle" fontWeight="700">
          xlsx
        </text>
      </g>

      {/* center tools */}
      <rect x={centerX} y="8" width={centerW} height="56" rx="12" fill="url(#mktFlowNode)" stroke="#2563eb" strokeWidth="2" />
      <g transform={`translate(${iconLeft}, 22)`} aria-hidden>
        <rect x="0" y="0" width="22" height="26" rx="3" fill="#fff" stroke="#93c5fd" strokeWidth="1" />
        <path d="M4 7h14M4 12h14M4 17h9" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="16" cy="20" r="5" fill="#eff6ff" stroke="#2563eb" strokeWidth="1" />
        <path d="M14.5 20h3M16 18.5v3" stroke="#2563eb" strokeWidth="1" />
      </g>
      <text x={textX} y="34" fill="#2563eb" fontSize="12" fontWeight="700">
        DB 표준 점검
      </text>

      <rect x={centerX} y="76" width={centerW} height="56" rx="12" fill="url(#mktFlowNode)" stroke="#93c5fd" strokeWidth="1.5" />
      <g transform={`translate(${iconLeft}, 90)`} aria-hidden>
        <rect x="0" y="4" width="20" height="24" rx="2" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1" />
        <rect x="4" y="8" width="12" height="3" rx="1" fill="#64748b" />
        <rect x="4" y="14" width="12" height="3" rx="1" fill="#64748b" />
        <rect x="4" y="20" width="8" height="3" rx="1" fill="#64748b" />
      </g>
      <text x={textX} y="102" fill="#1e40af" fontSize="12" fontWeight="700">
        DBManager
      </text>
      <g transform={`translate(${iconRight}, 88)`} aria-hidden>
        <rect x="0" y="0" width="32" height="28" rx="3" fill="#fff" stroke="#93c5fd" strokeWidth="1" />
        <rect x="0" y="0" width="32" height="7" rx="3" fill="#dbeafe" />
        <rect x="6" y="14" width="4" height="10" rx="1" fill="#2563eb" />
        <rect x="14" y="18" width="4" height="6" rx="1" fill="#60a5fa" />
        <rect x="22" y="12" width="4" height="12" rx="1" fill="#2563eb" />
      </g>

      <rect x={centerX} y="144" width={centerW} height="56" rx="12" fill="url(#mktFlowNode)" stroke="#93c5fd" strokeWidth="1.5" />
      <g transform={`translate(${iconLeft}, 156)`} aria-hidden>
        {/* Entity table A */}
        <rect x="0" y="4" width="15" height="22" rx="1.5" fill="#fff" stroke="#2563eb" strokeWidth="1" />
        <rect x="0" y="4" width="15" height="7" rx="1.5" fill="#dbeafe" />
        <path d="M1 11h13" stroke="#93c5fd" strokeWidth="0.8" />
        <path d="M2 14h9M2 17h9M2 20h6" stroke="#64748b" strokeWidth="0.9" strokeLinecap="round" />
        <circle cx="3.5" cy="14" r="0.9" fill="#2563eb" />
        {/* Relationship connector */}
        <path d="M15 15 H19" stroke="#2563eb" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M19 15 L16.5 13.2 M19 15 L16.5 16.8" stroke="#2563eb" strokeWidth="1" strokeLinecap="round" />
        {/* Entity table B */}
        <rect x="20" y="8" width="15" height="22" rx="1.5" fill="#fff" stroke="#2563eb" strokeWidth="1" />
        <rect x="20" y="8" width="15" height="7" rx="1.5" fill="#dbeafe" />
        <path d="M21 15h13" stroke="#93c5fd" strokeWidth="0.8" />
        <path d="M22 18h9M22 21h9M22 24h6" stroke="#64748b" strokeWidth="0.9" strokeLinecap="round" />
        <circle cx="23.5" cy="18" r="0.9" fill="#2563eb" />
      </g>
      <text x={textX} y="170" fill="#1e40af" fontSize="12" fontWeight="700">
        ER Modeler
      </text>

      {/* destination */}
      <rect x="710" y="76" width="196" height="56" rx="12" fill="url(#mktFlowNode)" stroke="#2563eb" strokeWidth="2" />
      <g transform="translate(724, 88)" aria-hidden>
        <path
          d="M14 4c5 0 9 3.5 9 7.5 0 4.5-4 8-9 12-5-4-9-7.5-9-12C5 7.5 9 4 14 4z"
          fill="#ecfdf5"
          stroke="#22c55e"
          strokeWidth="1.2"
        />
        <path d="M11.5 11.5l1.5 3.5 3.5-6" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="758" y="102" fill="#2563eb" fontSize="12" fontWeight="700">
        Supabase DB
      </text>
      <g transform="translate(862, 88)" aria-hidden>
        <ellipse cx="12" cy="8" rx="12" ry="5" fill="#dbeafe" stroke="#2563eb" strokeWidth="1" />
        <path d="M2 8v12c0 3 4.5 5 10 5s10-2 10-5V8" fill="#eff6ff" stroke="#2563eb" strokeWidth="1" />
        <ellipse cx="12" cy="20" rx="12" ry="5" fill="#dbeafe" stroke="#2563eb" strokeWidth="1" />
      </g>

      {/* connectors */}
      <g stroke="#2563eb" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M200 104 C270 104 310 36 360 36" />
        <path d="M200 104 H360" />
        <path d="M200 104 C270 104 310 172 360 172" />
        <path d="M580 104 H710" stroke="#93c5fd" />
      </g>
      <polygon points="356,32 364,36 356,40" fill="#2563eb" />
      <polygon points="356,100 364,104 356,108" fill="#2563eb" />
      <polygon points="356,168 364,172 356,176" fill="#2563eb" />
      <polygon points="706,100 714,104 706,108" fill="#93c5fd" />
    </svg>
  );
}
