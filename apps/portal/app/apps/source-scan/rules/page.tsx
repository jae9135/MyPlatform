"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/apiBase";

type RuleItem = {
  id: string;
  name?: string;
  category?: string;
  reference_url?: string;
};

type RuleRow = RuleItem & { ruleset: string };

export default function SourceScanRulesPage() {
  const [rulesPmd, setRulesPmd] = useState<RuleItem[]>([]);
  const [rulesFsb, setRulesFsb] = useState<RuleItem[]>([]);
  const [rulesQuery, setRulesQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/v1/source-scan/rules`);
        const j = await res.json();
        if (!res.ok) {
          throw new Error(j.detail || `규칙 조회 실패 (HTTP ${res.status})`);
        }
        setRulesPmd(j.pmd || []);
        setRulesFsb(j.findsecbugs || []);
      } catch (e) {
        setError(String((e as Error).message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredRules = useMemo(() => {
    const q = rulesQuery.trim().toLowerCase();
    const all: RuleRow[] = [
      ...rulesPmd.map((r) => ({ ...r, ruleset: "PMD" })),
      ...rulesFsb.map((r) => ({ ...r, ruleset: "FindSecBugs" })),
    ];
    if (!q) return all;
    return all.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        (r.name || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q)
    );
  }, [rulesPmd, rulesFsb, rulesQuery]);

  return (
    <main className="source-scan-popout">
      <section className="panel source-scan-popout-panel">
        <div className="source-scan-popout-head">
          <h1>규칙 카탈로그</h1>
        </div>
        <label className="search-row">
          검색
          <input
            value={rulesQuery}
            onChange={(e) => setRulesQuery(e.target.value)}
            placeholder="규칙 ID, 이름, 분류"
          />
        </label>
        {loading ? <p className="hint">불러오는 중…</p> : null}
        {error ? <p className="msg err">{error}</p> : null}
        {!loading && !error ? (
          <p className="hint">
            PMD {rulesPmd.length}건 · FindSecBugs {rulesFsb.length}건 · 표시 {filteredRules.length}건
          </p>
        ) : null}
        {filteredRules.length ? (
          <div className="table-wrap source-scan-popout-table">
            <table className="result-table">
              <thead>
                <tr>
                  <th>룰셋</th>
                  <th>ID</th>
                  <th>이름</th>
                  <th>분류</th>
                  <th>참조</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((r) => (
                  <tr key={`${r.ruleset}-${r.id}`}>
                    <td>{r.ruleset}</td>
                    <td>{r.id}</td>
                    <td>{r.name || ""}</td>
                    <td>{r.category || ""}</td>
                    <td>
                      {r.reference_url ? (
                        <a href={r.reference_url} target="_blank" rel="noreferrer">
                          문서
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
