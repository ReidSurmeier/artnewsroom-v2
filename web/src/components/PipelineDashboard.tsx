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

function AnimatedDot({ offset }: { offset: number }) {
  const pos = (offset % 100);
  return (
    <span className="hp-dot" style={{ left: `${pos}%` }}>
      &middot;
    </span>
  );
}

function Track({ label, frame }: { label: string; frame: number }) {
  return (
    <div className="hp-track">
      <span className="hp-track-label">{label}</span>
      <div className="hp-track-line">
        <AnimatedDot offset={(frame * 7) % 100} />
        <AnimatedDot offset={(frame * 7 + 33) % 100} />
        <AnimatedDot offset={(frame * 7 + 66) % 100} />
      </div>
      <span className="hp-track-arrow">&rarr;</span>
    </div>
  );
}

export default function PipelineDashboard({ onOpenAbout }: Props) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [frame, setFrame] = useState(0);
  const [activeSourceIdx, setActiveSourceIdx] = useState(0);
  const [scoreFrame, setScoreFrame] = useState({
    domain: 0,
    keyword: 0,
    source: 0,
    recency: 0,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/sources').then(r => r.json()).then(setSources).catch(() => {});
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => {});
    fetch('/api/articles').then(r => r.json()).then(setArticles).catch(() => {});
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setFrame(f => f + 1);
      setActiveSourceIdx(idx => (sources.length > 0 ? (idx + 1) % sources.length : 0));
      setScoreFrame({
        domain: Math.floor(Math.random() * 30),
        keyword: Math.floor(Math.random() * 40),
        source: Math.floor(Math.random() * 20),
        recency: Math.floor(Math.random() * 10),
      });
    }, 500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [sources.length]);

  const total = scoreFrame.domain + scoreFrame.keyword + scoreFrame.source + scoreFrame.recency;
  const pass = total >= 40;

  const tier1 = sources.filter(s => s.tier === 1);
  const tier2 = sources.filter(s => s.tier === 2);
  const tier3 = sources.filter(s => s.tier === 3);
  const tier4 = sources.filter(s => s.tier === 4);
  const activeSource = sources[activeSourceIdx];

  const gearFrames = ['/', '-', '\\', '|'];
  const gear = gearFrames[frame % 4];

  const nextScanTime = (() => {
    if (!status?.last_scan?.finished_at) return '--:--';
    const finished = new Date(status.last_scan.finished_at);
    finished.setHours(finished.getHours() + 8);
    return finished.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  const recentArticles = articles.slice(0, 8);

  // Score bar helper: renders a simple ASCII bar
  const scoreBar = (val: number, max: number) => {
    const filled = Math.round((val / max) * 10);
    return '[' + '#'.repeat(filled) + '-'.repeat(10 - filled) + ']';
  };

  return (
    <div className="hp-flow">
      <div className="hp-flow-row">
        {/* SOURCES BOX */}
        <div className="hp-box">
          <div className="hp-box-title">SOURCES</div>
          <div className="hp-box-content hp-scroll">
            {tier1.length > 0 && (
              <>
                <div className="hp-line"><span className="hp-dim">T1 ({tier1.length})</span></div>
                {tier1.map(s => (
                  <div key={s.id} className="hp-line" style={{ paddingLeft: '8px' }}>
                    {s.name === activeSource?.name ? '>' : ' '} {s.name}
                    {s.fetch_count > 0 && <span className="hp-dim"> [{s.fetch_count}]</span>}
                  </div>
                ))}
                <div className="hp-separator" />
              </>
            )}
            {tier2.length > 0 && (
              <>
                <div className="hp-line"><span className="hp-dim">T2 ({tier2.length})</span></div>
                {tier2.map(s => (
                  <div key={s.id} className="hp-line" style={{ paddingLeft: '8px' }}>
                    {s.name === activeSource?.name ? '>' : ' '} {s.name}
                  </div>
                ))}
                <div className="hp-separator" />
              </>
            )}
            {tier3.length > 0 && (
              <>
                <div className="hp-line"><span className="hp-dim">T3 ({tier3.length})</span></div>
                {tier3.map(s => (
                  <div key={s.id} className="hp-line" style={{ paddingLeft: '8px' }}>
                    {s.name === activeSource?.name ? '>' : ' '} {s.name}
                  </div>
                ))}
                <div className="hp-separator" />
              </>
            )}
            {tier4.length > 0 && (
              <>
                <div className="hp-line"><span className="hp-dim">T4 ({tier4.length})</span></div>
                {tier4.map(s => (
                  <div key={s.id} className="hp-line" style={{ paddingLeft: '8px' }}>
                    {s.name === activeSource?.name ? '>' : ' '} {s.name}
                  </div>
                ))}
                <div className="hp-separator" />
              </>
            )}
            <div className="hp-line">
              active: {activeSource?.name ?? '...'}
            </div>
          </div>
        </div>

        <Track label="fetch" frame={frame} />

        {/* SCANNER BOX */}
        <div className="hp-box">
          <div className="hp-box-title">SCANNER {gear}</div>
          <div className="hp-box-content">
            <div className="hp-line">rss parse &amp; dedup</div>
            <div className="hp-separator" />
            <div className="hp-line">
              <span className="hp-dim">scanned </span>
              {status?.last_scan?.sources_scanned ?? '--'}
            </div>
            <div className="hp-line">
              <span className="hp-dim">found   </span>
              {status?.last_scan?.candidates_found ?? '--'}
            </div>
            <div className="hp-line">
              <span className="hp-dim">promoted </span>
              {status?.last_scan?.articles_promoted ?? '--'}
            </div>
            <div className="hp-separator" />
            <div className="hp-subbox">
              <div className="hp-subbox-title">SQLITE DATABASE</div>
              <div className="hp-line">
                <span className="hp-dim">articles </span>
                {status?.total_articles ?? '--'}
              </div>
              <div className="hp-line">
                <span className="hp-dim">unread   </span>
                {status?.unread_count ?? '--'}
              </div>
              <div className="hp-line">
                <span className="hp-dim">saved    </span>
                {status?.saved_count ?? '--'}
              </div>
            </div>
          </div>
        </div>

        <Track label="score" frame={frame} />

        {/* TASTE SCORER BOX */}
        <div className="hp-box">
          <div className="hp-box-title">TASTE SCORER</div>
          <div className="hp-box-content">
            <div className="hp-line hp-dim">score breakdown</div>
            <div className="hp-separator" />
            <div className="hp-line">
              <span className="hp-dim">domain  </span>
              {scoreBar(scoreFrame.domain, 30)} {String(scoreFrame.domain).padStart(2, ' ')}/30
            </div>
            <div className="hp-line">
              <span className="hp-dim">keyword </span>
              {scoreBar(scoreFrame.keyword, 40)} {String(scoreFrame.keyword).padStart(2, ' ')}/40
            </div>
            <div className="hp-line">
              <span className="hp-dim">source  </span>
              {scoreBar(scoreFrame.source, 20)} {String(scoreFrame.source).padStart(2, ' ')}/20
            </div>
            <div className="hp-line">
              <span className="hp-dim">recency </span>
              {scoreBar(scoreFrame.recency, 10)} {String(scoreFrame.recency).padStart(2, ' ')}/10
            </div>
            <div className="hp-separator" />
            <div className="hp-line">
              <span className="hp-dim">total   </span>
              {String(total).padStart(3, ' ')}/100
            </div>
            <div className="hp-line">
              <span className="hp-dim">verdict </span>
              {pass ? 'PASS' : 'skip'}
            </div>
          </div>
        </div>

        <Track label="store" frame={frame} />

        {/* OUTPUT BOX */}
        <div className="hp-box">
          <div className="hp-box-title">OUTPUT</div>
          <div className="hp-box-content">
            <div className="hp-line">
              <span className="hp-dim">status </span>
              ready
            </div>
            <div className="hp-line">
              <span className="hp-dim">next   </span>
              {nextScanTime}
            </div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">recent:</div>
            {recentArticles.map((a, i) => (
              <div key={a.id} className="hp-line" style={{ opacity: i === 0 ? 1 : Math.max(0.2, 1 - i * 0.12) }}>
                {a.title}
              </div>
            ))}
            <div className="hp-separator" />
            <div className="hp-line hp-dim">tools: rss, scrape, sqlite</div>
          </div>
        </div>
      </div>

      {/* FEEDBACK TRACK */}
      <div className="hp-feedback-track">
        <span className="hp-feedback-label">sidebar</span>
        <div className="hp-feedback-line">
          <span className="hp-dot" style={{ left: `${(frame * 3) % 100}%` }}>&middot;</span>
          <span className="hp-dot" style={{ left: `${(frame * 3 + 50) % 100}%` }}>&middot;</span>
        </div>
        <span className="hp-feedback-label">reader</span>
        <div className="hp-feedback-line">
          <span className="hp-dot" style={{ left: `${(frame * 5 + 20) % 100}%` }}>&middot;</span>
        </div>
        <span
          className="hp-feedback-label"
          style={{ cursor: 'pointer' }}
          onClick={onOpenAbout}
        >
          [about]
        </span>
      </div>
    </div>
  );
}
