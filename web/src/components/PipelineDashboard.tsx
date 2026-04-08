'use client';

import { useEffect, useRef, useState } from 'react';

interface SourceRow {
  id: number;
  name: string;
  tier: number;
  fetch_count: number;
  error_count: number;
  enabled: number;
}

interface StatusData {
  total_articles: number;
  unread_count: number;
  saved_count: number;
  archived_count: number;
  last_scan: {
    started_at: string;
    finished_at: string | null;
    sources_scanned: number;
    candidates_found: number;
    articles_promoted: number;
    errors: string | null;
  } | null;
}

interface ArticleRow {
  id: string;
  title: string;
  source: string;
  date_added: string;
}

interface Props {
  onOpenAbout: () => void;
}

export default function PipelineDashboard({ onOpenAbout: _onOpenAbout }: Props) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const frameRef = useRef(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    fetch('/api/sources').then(r => r.json()).then(setSources).catch(() => {});
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => {});
    fetch('/api/articles').then(r => r.json()).then(setArticles).catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      frameRef.current++;
      setTick(t => t + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const f = frameRef.current;

  const tier1 = sources.filter(s => s.tier === 1);
  const tier2 = sources.filter(s => s.tier === 2);
  const tier3 = sources.filter(s => s.tier === 3);
  const tier4 = sources.filter(s => s.tier === 4);

  // Build source counts from article data (by source name)
  const srcCounts: Record<string, number> = {};
  for (const a of articles) {
    const s = a.source || 'unknown';
    srcCounts[s] = (srcCounts[s] || 0) + 1;
  }

  const ALL_SOURCES = sources; // already ordered by tier ASC, name ASC from API
  const activeSource = Math.floor(f / 120) % Math.max(1, ALL_SOURCES.length);

  const gearChars = ['⚙', '⊕', '⊗', '⊙'];
  const gear = gearChars[Math.floor(f / 40) % gearChars.length];

  const fetchN = Math.floor(290 + Math.sin(f * 0.001) * 30);
  const dedupN = Math.floor(145 + Math.sin(f * 0.0015) * 25);
  const progPos = Math.floor((f % 200) / 200 * 18);

  const titles = articles.slice(0, 30).map(a => a.title || '');
  const titleOffset = Math.floor(f / 120) % Math.max(1, titles.length);
  const statusDot = Math.sin(f * 0.008) > 0 ? '●' : '○';

  const scoreVals = [
    { label: 'domain affinity', desc: 'source appears in Are.na bookmarks', max: 30, val: Math.floor(Math.abs(Math.sin(f * 0.005)) * 30) },
    { label: 'keyword overlap', desc: 'title matches recurring themes', max: 40, val: Math.floor(Math.abs(Math.sin(f * 0.006 + 1.2)) * 40) },
    { label: 'source match', desc: 'publication in saved articles', max: 20, val: Math.floor(Math.abs(Math.sin(f * 0.007 + 2.4)) * 20) },
    { label: 'recency bonus', desc: '<1 day = 10, <3 days = 7, <7 = 4', max: 10, val: Math.floor(Math.abs(Math.sin(f * 0.008 + 3.6)) * 10) },
  ];
  const totalScore = scoreVals.reduce((a, b) => a + b.val, 0);

  const activeCount = status ? status.total_articles - status.archived_count : articles.length;
  const archivedCount = status?.archived_count ?? 0;
  const savedCount = status?.saved_count ?? 0;

  const dotPositions = (trackIdx: number) => {
    const dots = [];
    for (let d = 0; d < 2; d++) {
      const pos = ((f * 1.5 + d * 50 + trackIdx * 17) % 100) / 100;
      dots.push(pos);
    }
    return dots;
  };

  // Global index offset for each tier to correctly match activeSource
  const t1Start = 0;
  const t2Start = tier1.length;
  const t3Start = tier1.length + tier2.length;
  const t4Start = tier1.length + tier2.length + tier3.length;

  return (
    <div className="hp-flow">
      <div className="hp-flow-row">

        {/* SOURCES */}
        <div className="hp-box">
          <div className="hp-box-title">SOURCES</div>
          <div className="hp-box-content hp-scroll">
            {tier1.length > 0 && (
              <>
                <div className="hp-line hp-dim">tier 1 — {tier1.length} sources</div>
                {tier1.map((s, i) => {
                  const gi = t1Start + i;
                  const count = srcCounts[s.name] || 0;
                  return (
                    <div key={s.id} className="hp-line" style={{ opacity: gi === activeSource ? 0.9 : 0.35 }}>
                      {gi === activeSource ? '● ' : '· '}{s.name}{count > 0 ? ` (${count})` : ''}
                    </div>
                  );
                })}
                <div className="hp-separator" />
              </>
            )}
            {tier2.length > 0 && (
              <>
                <div className="hp-line hp-dim">tier 2 — {tier2.length} sources</div>
                {tier2.map((s, i) => {
                  const gi = t2Start + i;
                  const count = srcCounts[s.name] || 0;
                  return (
                    <div key={s.id} className="hp-line" style={{ opacity: gi === activeSource ? 0.9 : 0.35 }}>
                      {gi === activeSource ? '● ' : '· '}{s.name}{count > 0 ? ` (${count})` : ''}
                    </div>
                  );
                })}
                <div className="hp-separator" />
              </>
            )}
            {tier3.length > 0 && (
              <>
                <div className="hp-line hp-dim">tier 3 — {tier3.length} indie</div>
                {tier3.map((s, i) => {
                  const gi = t3Start + i;
                  const count = srcCounts[s.name] || 0;
                  return (
                    <div key={s.id} className="hp-line" style={{ opacity: gi === activeSource ? 0.9 : 0.35 }}>
                      {gi === activeSource ? '● ' : '· '}{s.name}{count > 0 ? ` (${count})` : ''}
                    </div>
                  );
                })}
                <div className="hp-separator" />
              </>
            )}
            {tier4.length > 0 && (
              <>
                <div className="hp-line hp-dim">tier 4 — {tier4.length} sources</div>
                {tier4.map((s, i) => {
                  const gi = t4Start + i;
                  const count = srcCounts[s.name] || 0;
                  return (
                    <div key={s.id} className="hp-line" style={{ opacity: gi === activeSource ? 0.9 : 0.35 }}>
                      {gi === activeSource ? '● ' : '· '}{s.name}{count > 0 ? ` (${count})` : ''}
                    </div>
                  );
                })}
                <div className="hp-separator" />
              </>
            )}
            <div className="hp-line hp-dim">{ALL_SOURCES.length} total RSS feeds</div>
          </div>
        </div>

        <div className="hp-track">
          <div className="hp-track-label">fetch</div>
          <div className="hp-track-line">
            {dotPositions(0).map((pos, i) => (
              <span key={i} className="hp-dot" style={{ left: `${pos * 100}%` }}>·</span>
            ))}
          </div>
        </div>

        {/* SCANNER */}
        <div className="hp-box">
          <div className="hp-box-title">SCANNER</div>
          <div className="hp-box-content">
            <div className="hp-line">{gear} daily scan at 8:00 AM ET</div>
            <div className="hp-separator" />
            <div className="hp-line">rss-parser fetches all feeds</div>
            <div className="hp-line">fetched: ~{fetchN} items</div>
            <div className="hp-line">deduped by URL: -{dedupN}</div>
            <div className="hp-line">new candidates: ~{fetchN - dedupN}</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">
              [{'░'.repeat(progPos)}{'·'.repeat(18 - progPos)}]
            </div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">auto-archive after 7 days</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim" style={{ textAlign: 'center' }}>↓</div>
            <div className="hp-subbox">
              <div className="hp-subbox-title">SQLITE DATABASE</div>
              <div className="hp-line">active: {activeCount}</div>
              <div className="hp-line">archived: {archivedCount}</div>
              <div className="hp-line">saved: {savedCount}</div>
            </div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">tools</div>
            <div className="hp-line hp-dim">rss-parser</div>
            <div className="hp-line hp-dim">better-sqlite3</div>
            <div className="hp-line hp-dim">playwright (browser-only)</div>
            <div className="hp-line hp-dim">@mozilla/readability</div>
          </div>
        </div>

        <div className="hp-track">
          <div className="hp-track-label">score</div>
          <div className="hp-track-line">
            {dotPositions(1).map((pos, i) => (
              <span key={i} className="hp-dot" style={{ left: `${pos * 100}%` }}>·</span>
            ))}
          </div>
        </div>

        {/* TASTE SCORER */}
        <div className="hp-box">
          <div className="hp-box-title">TASTE SCORER</div>
          <div className="hp-box-content">
            <div className="hp-line hp-dim">each article scored 0–100</div>
            <div className="hp-line hp-dim">based on Are.na taste profile</div>
            <div className="hp-separator" />
            {scoreVals.map((w, i) => (
              <div key={i}>
                <div className="hp-line">{w.label} (0–{w.max})</div>
                <div className="hp-line hp-dim">{w.desc}</div>
                <div className="hp-line hp-dim">
                  {'░'.repeat(Math.floor((w.val / w.max) * 12))}{'·'.repeat(12 - Math.floor((w.val / w.max) * 12))} {w.val}/{w.max}
                </div>
              </div>
            ))}
            <div className="hp-separator" />
            <div className="hp-line">total: {totalScore}/100</div>
            <div className="hp-line hp-dim">threshold: 50 → {totalScore > 50 ? 'pass' : 'skip'}</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">log₂ weighted scoring</div>
            <div className="hp-line hp-dim">tokens filtered len &gt; 3</div>
          </div>
        </div>

        <div className="hp-track">
          <div className="hp-track-label">store</div>
          <div className="hp-track-line">
            {dotPositions(2).map((pos, i) => (
              <span key={i} className="hp-dot" style={{ left: `${pos * 100}%` }}>·</span>
            ))}
          </div>
        </div>

        {/* OUTPUT */}
        <div className="hp-box">
          <div className="hp-box-title">OUTPUT</div>
          <div className="hp-box-content">
            <div className="hp-line hp-dim">latest articles</div>
            <div className="hp-separator" />
            {Array.from({ length: 12 }, (_, i) => {
              const idx = (titleOffset + i) % Math.max(1, titles.length);
              const title = (titles[idx] || '').substring(0, 28);
              return (
                <div key={i} className="hp-line" style={{ opacity: i === 0 || i === 11 ? 0.15 : 0.4 }}>
                  {title || '·'}
                </div>
              );
            })}
            <div className="hp-separator" />
            <div className="hp-line">{statusDot} nominal</div>
            <div className="hp-line hp-dim">next scan: 8:00 AM ET</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">built with</div>
            <div className="hp-line hp-dim">next.js · react · sqlite</div>
            <div className="hp-line hp-dim">pdf-lib · turndown</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">source</div>
            <div className="hp-line hp-dim">github.com/reidsurmeier</div>
            <div className="hp-line hp-dim">/artnewsroom</div>
          </div>
        </div>

      </div>

      {/* Output → Sidebar connection */}
      <div className="hp-feedback-track">
        <div className="hp-feedback-line">
          {[0, 1, 2].map(d => {
            const pos = ((f * 1.5 + d * 33) % 100) / 100;
            return <span key={d} className="hp-dot" style={{ left: `${pos * 100}%` }}>·</span>;
          })}
        </div>
        <div className="hp-feedback-label">→ sidebar ({Math.min(3, titles.length)} latest)</div>
      </div>
    </div>
  );
}
