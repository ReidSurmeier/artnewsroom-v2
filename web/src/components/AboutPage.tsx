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

function Track({ label, frame }: { label: string; frame: number }) {
  return (
    <div className="hp-track" style={{ width: '100%', minWidth: 'unset', flexDirection: 'row', alignItems: 'center', padding: '4px 0', gap: '8px' }}>
      <span className="hp-track-label" style={{ marginBottom: 0 }}>{label}</span>
      <div className="hp-track-line" style={{ flex: 1 }}>
        <span className="hp-dot" style={{ left: `${(frame * 7) % 100}%` }}>&middot;</span>
        <span className="hp-dot" style={{ left: `${(frame * 7 + 50) % 100}%` }}>&middot;</span>
      </div>
    </div>
  );
}

const KAOMOJIS = ['(^_^)', '(^-^)', '(^o^)', '(^.^)', '(=^_^=)', '(*^_^*)', '(^_-)'];

export default function AboutPage({ onClose }: Props) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [frame, setFrame] = useState(0);
  const [kaoIdx, setKaoIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => {});
    intervalRef.current = setInterval(() => {
      setFrame(f => f + 1);
      setKaoIdx(i => (i + 1) % KAOMOJIS.length);
    }, 500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const gearFrames = ['-', '\\', '|', '/'];
  const gear = gearFrames[frame % 4];

  const lastScanTime = status?.last_scan?.finished_at
    ? new Date(status.last_scan.finished_at).toLocaleString()
    : 'never';

  const uptime = status ? '100%' : '--';

  return (
    <div
      className="hp-flow"
      style={{ fontFamily: "'AUTHENTICSans-Condensed-90', sans-serif", fontSize: '0.7rem', color: '#888' }}
    >
      <div className="hp-flow-row" style={{ gap: 0, alignItems: 'flex-start' }}>
        {/* Left column: 2/3 */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
          {/* Top row: ABOUT + DISCLAIMER */}
          <div style={{ display: 'flex', gap: 0 }}>
            {/* ABOUT */}
            <div className="hp-box" style={{ flex: 1 }}>
              <div className="hp-box-title">ABOUT</div>
              <div className="hp-box-content">
                <div className="hp-line">artnewsroom v2</div>
                <div className="hp-line hp-dim">personal art news aggregator</div>
                <div className="hp-separator" />
                <div className="hp-line">reid surmeier {KAOMOJIS[kaoIdx]}</div>
                <div className="hp-line hp-dim">risd &mdash; art + software</div>
                <div className="hp-separator" />
                <div className="hp-line">
                  <a href="https://instagram.com/reidsurmeier" target="_blank" rel="noopener noreferrer">
                    instagram
                  </a>
                </div>
                <div className="hp-line">
                  <a href="https://reidsurmeier.wtf" target="_blank" rel="noopener noreferrer">
                    reidsurmeier.wtf
                  </a>
                </div>
                <div className="hp-line">
                  <a href="https://are.na/reid-surmeier" target="_blank" rel="noopener noreferrer">
                    are.na
                  </a>
                </div>
                <div className="hp-line">
                  <a href="mailto:reid@reidsurmeier.wtf">
                    reid@reidsurmeier.wtf
                  </a>
                </div>
              </div>
            </div>

            {/* DISCLAIMER */}
            <div className="hp-box" style={{ flex: 1 }}>
              <div className="hp-box-title">DISCLAIMER</div>
              <div className="hp-box-content">
                <div className="hp-line">personal reading tool.</div>
                <div className="hp-line">not affiliated with any publication.</div>
                <div className="hp-line">content belongs to original authors.</div>
                <div className="hp-separator" />
                <div className="hp-line hp-dim">copyright of all articles belongs</div>
                <div className="hp-line hp-dim">to their respective publishers.</div>
                <div className="hp-separator" />
                <div className="hp-line">removal requests:</div>
                <div className="hp-line">
                  <a href="mailto:reid@reidsurmeier.wtf">
                    reid@reidsurmeier.wtf
                  </a>
                </div>
              </div>
            </div>
          </div>

          <Track label="service status" frame={frame} />

          {/* STATUS */}
          <div className="hp-box">
            <div className="hp-box-title">STATUS {gear}</div>
            <div className="hp-box-content">
              <div style={{ display: 'flex', gap: 0 }}>
                <div style={{ flex: 1 }}>
                  <div className="hp-line">
                    <span className="hp-dim">uptime      </span>
                    {uptime}
                  </div>
                  <div className="hp-line">
                    <span className="hp-dim">articles    </span>
                    {status?.total_articles ?? '--'}
                  </div>
                  <div className="hp-line">
                    <span className="hp-dim">unread      </span>
                    {status?.unread_count ?? '--'}
                  </div>
                  <div className="hp-line">
                    <span className="hp-dim">saved       </span>
                    {status?.saved_count ?? '--'}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="hp-line">
                    <span className="hp-dim">last scan   </span>
                    {lastScanTime}
                  </div>
                  <div className="hp-line">
                    <span className="hp-dim">promoted    </span>
                    {status?.last_scan?.articles_promoted ?? '--'}
                  </div>
                  <div className="hp-line">
                    <span className="hp-dim">scanned     </span>
                    {status?.last_scan?.sources_scanned ?? '--'}
                  </div>
                </div>
              </div>
              <div className="hp-separator" />
              <div className="hp-line">all systems operational</div>
            </div>
          </div>

          <Track label="privacy" frame={frame} />

          {/* PRIVACY */}
          <div className="hp-box">
            <div className="hp-box-title">PRIVACY</div>
            <div className="hp-box-content">
              <div className="hp-line">no tracking. no analytics.</div>
              <div className="hp-line">no external requests from browser.</div>
              <div className="hp-separator" />
              <div className="hp-line hp-dim">blocked trackers:</div>
              <div className="hp-line hp-dim" style={{ paddingLeft: '8px' }}>doubleclick.net</div>
              <div className="hp-line hp-dim" style={{ paddingLeft: '8px' }}>googleapis.com</div>
              <div className="hp-line hp-dim" style={{ paddingLeft: '8px' }}>google-analytics.com</div>
              <div className="hp-line hp-dim" style={{ paddingLeft: '8px' }}>gstatic.com</div>
              <div className="hp-separator" />
              <div className="hp-line hp-dim">annotations stored locally in SQLite.</div>
              <div className="hp-line hp-dim">read state stored locally.</div>
            </div>
          </div>
        </div>

        {/* Vertical track between columns */}
        <div style={{ width: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px' }}>
          <span className="hp-track-label" style={{ writingMode: 'vertical-rl', marginBottom: '8px' }}>legal</span>
          <div style={{ width: '1px', flex: 1, background: '#ccc', position: 'relative' }}>
            <span className="hp-dot" style={{ left: '-3px', top: `${(frame * 3) % 100}%` }}>&middot;</span>
          </div>
        </div>

        {/* Right column: 1/3 — LEGAL */}
        <div className="hp-box" style={{ flex: 1 }}>
          <div className="hp-box-title">LEGAL</div>
          <div className="hp-box-content">
            <div className="hp-line hp-dim">disclaimer</div>
            <div className="hp-separator" />
            <div className="hp-line">artnewsroom is a personal, non-commercial</div>
            <div className="hp-line">reading tool for private use only.</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">no reproduction or distribution</div>
            <div className="hp-line hp-dim">of aggregated content is permitted.</div>
            <div className="hp-line hp-dim">all article content remains the</div>
            <div className="hp-line hp-dim">property of original publishers.</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">fair use</div>
            <div className="hp-separator" />
            <div className="hp-line">use of article excerpts and metadata</div>
            <div className="hp-line">is believed to qualify as fair use</div>
            <div className="hp-line">under 17 U.S.C. &sect; 107 for purposes</div>
            <div className="hp-line">of commentary and personal research.</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">copyrights</div>
            <div className="hp-separator" />
            <div className="hp-line hp-dim">all trademarks, service marks, and</div>
            <div className="hp-line hp-dim">publication names are property of</div>
            <div className="hp-line hp-dim">their respective owners.</div>
            <div className="hp-separator" />
            <div className="hp-line">
              <button
                onClick={onClose}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  background: 'none',
                  border: '1px solid #ccc',
                  cursor: 'pointer',
                  padding: '2px 8px',
                  color: '#888',
                }}
              >
                close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom feedback track */}
      <div className="hp-feedback-track">
        <span className="hp-feedback-label">artnewsroom</span>
        <div className="hp-feedback-line">
          <span className="hp-dot" style={{ left: `${(frame * 4) % 100}%` }}>&middot;</span>
          <span className="hp-dot" style={{ left: `${(frame * 4 + 50) % 100}%` }}>&middot;</span>
        </div>
        <span className="hp-feedback-label">v2</span>
      </div>
    </div>
  );
}
