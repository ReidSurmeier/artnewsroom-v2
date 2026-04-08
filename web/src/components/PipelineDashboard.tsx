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
  const pos = ((offset % 100) / 100) * 100;
  return (
    <span
      className="hp-dot"
      style={{ left: `${pos}%` }}
    >
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
    </div>
  );
}

export default function PipelineDashboard({ onOpenAbout }: Props) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [frame, setFrame] = useState(0);
  const [activeSourceIdx, setActiveSourceIdx] = useState(0);
  const [scoreFrame, setScoreFrame] = useState({ domain: 0, keyword: 0, source: 0, recency: 0, total: 0, pass: false });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/sources').then(r => r.json()).then(setSources).catch(() => {});
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => {});
    fetch('/api/articles').then(r => r.json()).then(setArticles).catch(() => {});
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setFrame(f => {
        const next = f + 1;
        // Cycle active source
        setActiveSourceIdx(idx => (sources.length > 0 ? (idx + 1) % sources.length : 0));
        // Animate score breakdown
        setScoreFrame({
          domain: Math.floor(Math.random() * 30),
          keyword: Math.floor(Math.random() * 40),
          source: Math.floor(Math.random() * 15) + 5,
          recency: Math.floor(Math.random() * 15),
          total: 0,
          pass: false,
        });
        return next;
      });
    }, 500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [sources.length]);

  const total = scoreFrame.domain + scoreFrame.keyword + scoreFrame.source + scoreFrame.recency;
  const pass = total >= 40;

  const tier1 = sources.filter(s => s.tier === 1);
  const tier2 = sources.filter(s => s.tier === 2);
  const tier3 = sources.filter(s => s.tier === 3);
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

  return (
    <div className="hp-flow">
      <div className="hp-flow-row">
        {/* SOURCES BOX */}
        <div className="hp-box">
          <div className="hp-box-title">SOURCES</div>
          <div className="hp-box-content">
            <div className="hp-line">
              <span className="hp-dim">T1 </span>{tier1.length} sources
            </div>
            {tier1.slice(0, 3).map(s => (
              <div key={s.id} className="hp-line hp-dim" style={{ paddingLeft: '8px' }}>
                {s.name === activeSource?.name ? '>' : ' '} {s.name}
              </div>
            ))}
            <div className="hp-separator" />
            <div className="hp-line">
              <span className="hp-dim">T2 </span>{tier2.length} sources
            </div>
            {tier2.slice(0, 3).map(s => (
              <div key={s.id} className="hp-line hp-dim" style={{ paddingLeft: '8px' }}>
                {s.name === activeSource?.name ? '>' : ' '} {s.name}
              </div>
            ))}
            <div className="hp-separator" />
            <div className="hp-line">
              <span className="hp-dim">T3 </span>{tier3.length} indie
            </div>
            <div className="hp-separator" />
            <div className="hp-line">
              active: <span style={{ color: '#aaa' }}>{activeSource?.name ?? '...'}</span>
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
              <span className="hp-dim">found    </span>
              {status?.last_scan?.candidates_found ?? '--'}
            </div>
            <div className="hp-line">
              <span className="hp-dim">promoted </span>
              {status?.last_scan?.articles_promoted ?? '--'}
            </div>
            <div className="hp-separator" />
            <div className="hp-subbox">
              <div className="hp-subbox-title">SQLITE</div>
              <div className="hp-line">
                <span className="hp-dim">articles </span>
                {status?.total_articles ?? '--'}
              </div>
              <div className="hp-line">
                <span className="hp-dim">unread   </span>
                {status?.unread_count ?? '--'}
              </div>
            </div>
          </div>
        </div>

        <Track label="score" frame={frame} />

        {/* TASTE SCORER BOX */}
        <div className="hp-box">
          <div className="hp-box-title">TASTE SCORER</div>
          <div className="hp-box-content">
            <div className="hp-line">
              <span className="hp-dim">domain   </span>
              <span style={{ color: scoreFrame.domain > 20 ? '#aaa' : '#666' }}>
                {String(scoreFrame.domain).padStart(2, ' ')}/30
              </span>
            </div>
            <div className="hp-line">
              <span className="hp-dim">keyword  </span>
              <span style={{ color: scoreFrame.keyword > 25 ? '#aaa' : '#666' }}>
                {String(scoreFrame.keyword).padStart(2, ' ')}/40
              </span>
            </div>
            <div className="hp-line">
              <span className="hp-dim">source   </span>
              <span style={{ color: scoreFrame.source > 10 ? '#aaa' : '#666' }}>
                {String(scoreFrame.source).padStart(2, ' ')}/15
              </span>
            </div>
            <div className="hp-line">
              <span className="hp-dim">recency  </span>
              <span style={{ color: scoreFrame.recency > 10 ? '#aaa' : '#666' }}>
                {String(scoreFrame.recency).padStart(2, ' ')}/15
              </span>
            </div>
            <div className="hp-separator" />
            <div className="hp-line">
              <span className="hp-dim">total    </span>
              <span style={{ color: pass ? '#bbb' : '#555' }}>
                {String(total).padStart(3, ' ')}/100
              </span>
            </div>
            <div className="hp-line">
              <span className="hp-dim">verdict  </span>
              <span style={{ color: pass ? '#aaa' : '#555' }}>
                {pass ? 'PASS' : 'SKIP'}
              </span>
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
              <span style={{ color: '#aaa' }}>ready</span>
            </div>
            <div className="hp-line">
              <span className="hp-dim">next   </span>
              {nextScanTime}
            </div>
            <div className="hp-separator" />
            {recentArticles.map((a, i) => (
              <div key={a.id} className="hp-line" style={{ opacity: i === 0 ? 1 : 0.45 }}>
                {a.title}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FEEDBACK TRACK */}
      <div className="hp-feedback-track">
        <span className="hp-feedback-label">sidebar</span>
        <div className="hp-feedback-line">
          <span
            className="hp-dot"
            style={{ left: `${((frame * 3) % 100)}%` }}
          >
            &middot;
          </span>
          <span
            className="hp-dot"
            style={{ left: `${((frame * 3 + 50) % 100)}%` }}
          >
            &middot;
          </span>
        </div>
        <span className="hp-feedback-label">reader</span>
        <span className="hp-feedback-label" style={{ cursor: 'pointer', opacity: 0.6 }} onClick={onOpenAbout}>
          [about]
        </span>
      </div>
    </div>
  );
}
