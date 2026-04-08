'use client';

import { useEffect, useRef, useState } from 'react';

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

interface Props {
  onClose: () => void;
}

export default function AboutPage({ onClose }: Props) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [frame, setFrame] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => {});
    intervalRef.current = setInterval(() => setFrame(f => f + 1), 500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const gearFrames = ['-', '\\', '|', '/'];
  const gear = gearFrames[frame % 4];

  const lastScanTime = status?.last_scan?.finished_at
    ? new Date(status.last_scan.finished_at).toLocaleString()
    : 'never';

  return (
    <div style={{
      fontFamily: "'AUTHENTICSans-Condensed-90', monospace",
      fontSize: '0.7rem',
      color: '#888',
      padding: '24px',
      maxWidth: '800px',
      margin: '0 auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
        <span style={{ color: '#444', fontSize: '0.6rem' }}>ABOUT</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '0.65rem' }}
        >
          close
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* ABOUT box */}
        <div className="hp-box">
          <div className="hp-box-title">ABOUT</div>
          <div className="hp-box-content">
            <div className="hp-line">artnewsroom v2</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">reid surmeier</div>
            <div className="hp-line hp-dim">risd &mdash; art + software</div>
            <div className="hp-separator" />
            <div className="hp-line">
              <a href="https://reidsurmeier.wtf" target="_blank" rel="noopener noreferrer"
                style={{ color: '#666', textDecoration: 'none' }}>
                reidsurmeier.wtf
              </a>
            </div>
          </div>
        </div>

        {/* STATUS box */}
        <div className="hp-box">
          <div className="hp-box-title">STATUS {gear}</div>
          <div className="hp-box-content">
            <div className="hp-line">
              <span className="hp-dim">articles  </span>
              {status?.total_articles ?? '--'}
            </div>
            <div className="hp-line">
              <span className="hp-dim">unread    </span>
              {status?.unread_count ?? '--'}
            </div>
            <div className="hp-line">
              <span className="hp-dim">saved     </span>
              {status?.saved_count ?? '--'}
            </div>
            <div className="hp-separator" />
            <div className="hp-line">
              <span className="hp-dim">last scan </span>
              {lastScanTime}
            </div>
            <div className="hp-line">
              <span className="hp-dim">promoted  </span>
              {status?.last_scan?.articles_promoted ?? '--'}
            </div>
          </div>
        </div>

        {/* DISCLAIMER box */}
        <div className="hp-box">
          <div className="hp-box-title">DISCLAIMER</div>
          <div className="hp-box-content">
            <div className="hp-line">personal reading tool.</div>
            <div className="hp-line">not affiliated with any publication.</div>
            <div className="hp-line">content belongs to original authors.</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">curated by taste algorithm</div>
            <div className="hp-line hp-dim">filtered for art, design, culture</div>
          </div>
        </div>

        {/* PRIVACY box */}
        <div className="hp-box">
          <div className="hp-box-title">PRIVACY</div>
          <div className="hp-box-content">
            <div className="hp-line">no tracking. no analytics.</div>
            <div className="hp-line">no external requests from browser.</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">annotations stored locally in SQLite.</div>
            <div className="hp-line hp-dim">read state stored locally.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
