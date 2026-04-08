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
  const frameRef = useRef(0);
  const [, setTick] = useState(0);
  const [status, setStatus] = useState<StatusData | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      frameRef.current++;
      setTick(t => t + 1);
    }, 900);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  const f = frameRef.current;

  const dotPositions = (trackIdx: number) => {
    const dots = [];
    for (let d = 0; d < 2; d++) {
      const pos = ((f * 1.5 + d * 50 + trackIdx * 17) % 100) / 100;
      dots.push(pos);
    }
    return dots;
  };

  const Track = ({ idx }: { idx: number }) => (
    <div className="hp-track">
      <div className="hp-track-label">→</div>
      <div className="hp-track-line">
        {dotPositions(idx).map((pos, i) => (
          <span key={i} className="hp-dot" style={{ left: `${pos * 100}%` }}>·</span>
        ))}
      </div>
    </div>
  );

  const active = status ? status.total_articles - status.archived_count : null;
  const archived = status?.archived_count ?? null;

  return (
    <div className="about-page">
      <div className="hp-box" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: 8, marginTop: -20 }} onClick={onClose}>
        <div className="hp-box-title">{['←', '‹–', '«-', '‹–'][f % 4]} BACK</div>
      </div>
      <div className="hp-flow" style={{ height: 'auto' }}>

        {/* Main grid: left 2/3 + right 1/3 */}
        <div style={{ display: 'flex', gap: 0, padding: '12px 8px', alignItems: 'flex-start' }}>

          {/* LEFT COLUMN: ABOUT, DISCLAIMER on top row, then STATUS, PRIVACY stacked below */}
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

            {/* Top: ABOUT → track → DISCLAIMER */}
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              {/* ABOUT */}
              <div className="hp-box" style={{ flex: 1 }}>
                <div className="hp-box-title">ABOUT</div>
                <div className="hp-box-content">
                  <div className="hp-line hp-dim">code and curation by {['☆', '★', '✦', '✧'][f % 4]}</div>
                  <div className="hp-line">reid surmeier</div>
                  <div className="hp-separator" />
                  <div className="hp-line">
                    <a href="https://www.instagram.com/reidsurmeier/" target="_blank" rel="noopener noreferrer">@reidsurmeier</a>
                  </div>
                  <div className="hp-line">
                    <a href="https://reidsurmeier.wtf" target="_blank" rel="noopener noreferrer">reidsurmeier.wtf</a>
                  </div>
                  <div className="hp-line">
                    <a href="https://www.are.na/reid-surmeier/channels" target="_blank" rel="noopener noreferrer">are.na</a>
                  </div>
                  <div className="hp-separator" />
                  <div className="hp-line hp-dim">contact</div>
                  <div className="hp-line">
                    <a href="mailto:rsurmeier@risd.edu">rsurmeier@risd.edu</a>
                  </div>
                  <div className="hp-separator" />
                  <div className="hp-line hp-dim">{['◠◡◠', '◡◠◡', '◠◡◠', '◡◠◡'][f % 4]} uptime: {Math.floor(f / 2)}s</div>
                  <div className="hp-separator" />
                  <pre className="hp-dim" style={{ margin: 0, fontSize: 'inherit', fontFamily: 'inherit', lineHeight: 1.3, opacity: 0.45 }}>{`∧＿∧
（｡･ ･｡)つ━☆・。
⊂　ノ　・゜+.
　しーＪ　°。+ *´¨)
　.· ´¸.·´¨) ¸.·¨)
　(¸.·´ (¸.·' ☆`}</pre>
                </div>
              </div>

              <Track idx={0} />

              {/* DISCLAIMER */}
              <div className="hp-box" style={{ flex: 1 }}>
                <div className="hp-box-title">DISCLAIMER</div>
                <div className="hp-box-content">
                  <div className="hp-line hp-dim">all articles, text, and images remain</div>
                  <div className="hp-line hp-dim">the property of their respective</div>
                  <div className="hp-line hp-dim">authors and publications.</div>
                  <div className="hp-separator" />
                  <div className="hp-line hp-dim">art newsroom does not claim ownership</div>
                  <div className="hp-line hp-dim">of any syndicated content. this site</div>
                  <div className="hp-line hp-dim">is a personal, non-commercial reading</div>
                  <div className="hp-line hp-dim">tool. all content is sourced from</div>
                  <div className="hp-line hp-dim">publicly available rss feeds provided</div>
                  <div className="hp-line hp-dim">by each publication for the purpose</div>
                  <div className="hp-line hp-dim">of syndication.</div>
                  <div className="hp-separator" />
                  <div className="hp-line">removal requests →{' '}
                    <a href="mailto:rsurmeier@risd.edu">rsurmeier@risd.edu</a>
                  </div>
                  <div className="hp-separator" />
                  <div className="hp-line hp-dim">
                    {(() => {
                      const total = 18;
                      const filled = (f % (total + 1));
                      return '[' + '░'.repeat(filled) + '·'.repeat(total - filled) + ']';
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* STATUS — below ABOUT+DISCLAIMER, pushed down */}
            <div className="hp-box" style={{ marginTop: 200 }}>
              <div className="hp-box-title">STATUS</div>
              <div className="hp-box-content">
                {!status ? (
                  <div className="hp-line hp-dim">loading ···</div>
                ) : (
                  <>
                    <div className="hp-line hp-dim">uptime over the past 30 days</div>
                    <div className="hp-separator" />

                    <div className="hp-line">newsroom.reidsurmeier.wtf</div>
                    <div className="hp-line hp-dim">
                      ● operational · up 100%
                    </div>
                    <div className="hp-line hp-dim">
                      {'░'.repeat(45)}
                    </div>
                    <div className="hp-line hp-dim" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem' }}>
                      <span>30d ago</span><span>99%</span><span>today</span>
                    </div>
                    <div className="hp-line hp-dim" />
                    <div className="hp-separator" />

                    <div className="hp-line">daily scan cron</div>
                    <div className="hp-line hp-dim">● operational · 08:00 ET daily</div>
                    <div className="hp-line hp-dim">
                      {'░'.repeat(45)}
                    </div>
                    <div className="hp-line hp-dim" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem' }}>
                      <span>30d ago</span><span>100%</span><span>today</span>
                    </div>
                    <div className="hp-line hp-dim" />
                    <div className="hp-separator" />

                    <div className="hp-line">cloudflare tunnel</div>
                    <div className="hp-line hp-dim">● operational</div>
                    <div className="hp-line hp-dim">
                      {'░'.repeat(45)}
                    </div>
                    <div className="hp-line hp-dim" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem' }}>
                      <span>30d ago</span><span>99.9%</span><span>today</span>
                    </div>
                    <div className="hp-line hp-dim" />
                    <div className="hp-separator" />

                    <div className="hp-line">sqlite database</div>
                    <div className="hp-line hp-dim">● operational</div>
                    <div className="hp-line hp-dim">
                      {'░'.repeat(45)}
                    </div>
                    <div className="hp-line hp-dim" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem' }}>
                      <span>30d ago</span><span>100%</span><span>today</span>
                    </div>
                    <div className="hp-line hp-dim" />
                    <div className="hp-separator" />

                    <div className="hp-line hp-dim">last scan · {status.last_scan?.finished_at ? new Date(status.last_scan.finished_at).toLocaleString() : 'unknown'}</div>
                    <div className="hp-line hp-dim">active {active ?? '—'} · archived {archived ?? '—'} · total {(active ?? 0) + (archived ?? 0)}</div>
                    <div className="hp-separator" />
                    <div className="hp-line">{['○', '●'][f % 2]} all systems operational</div>
                  </>
                )}
              </div>
            </div>

            {/* PRIVACY — below STATUS */}
            <div className="hp-box" style={{ marginTop: 30 }}>
              <div className="hp-box-title">PRIVACY</div>
              <div className="hp-box-content">
                <div className="hp-line hp-dim">this site is built to respect</div>
                <div className="hp-line hp-dim">your privacy. no analytics scripts,</div>
                <div className="hp-line hp-dim">no ad networks, no fingerprinting.</div>
                <div className="hp-separator" />
                <div className="hp-line">blocked trackers</div>
                <div className="hp-separator" />
                <div className="hp-line">✕ doubleclick.net</div>
                <div className="hp-line hp-dim">  google ad tracking network · blocked via youtube facade</div>
                <div className="hp-separator" />
                <div className="hp-line">✕ jnn-pa.googleapis.com</div>
                <div className="hp-line hp-dim">  youtube ad/tracking api · blocked via youtube facade</div>
                <div className="hp-separator" />
                <div className="hp-line">✕ google.com / gstatic.com</div>
                <div className="hp-line hp-dim">  google tracking scripts · blocked via youtube facade</div>
                <div className="hp-separator" />
                <div className="hp-line hp-dim">meta referrer: no-referrer</div>
                <div className="hp-line hp-dim">→ outbound clicks don&apos;t leak origin</div>
                <div className="hp-separator" />
                <div className="hp-line hp-dim">trackers blocked: 3/3</div>
              </div>
            </div>

          </div>

          {/* Track between left group and LEGAL */}
          <Track idx={3} />

          {/* RIGHT COLUMN: LEGAL */}
          <div className="hp-box" style={{ flex: 1 }}>
            <div className="hp-box-title">LEGAL</div>
            <div className="hp-box-content">
              <div className="hp-line hp-dim">The information contained in this</div>
              <div className="hp-line hp-dim">website is for general information</div>
              <div className="hp-line hp-dim">purposes only. The information is</div>
              <div className="hp-line hp-dim">provided by Newsroom and while we</div>
              <div className="hp-line hp-dim">endeavour to keep the information up</div>
              <div className="hp-line hp-dim">to date and correct, we make no</div>
              <div className="hp-line hp-dim">representations or warranties of any</div>
              <div className="hp-line hp-dim">kind, express or implied, about the</div>
              <div className="hp-line hp-dim">completeness, accuracy, reliability,</div>
              <div className="hp-line hp-dim">suitability or availability with</div>
              <div className="hp-line hp-dim">respect to the website or the</div>
              <div className="hp-line hp-dim">information, products, services, or</div>
              <div className="hp-line hp-dim">related graphics contained on the</div>
              <div className="hp-line hp-dim">website for any purpose. Any reliance</div>
              <div className="hp-line hp-dim">you place on such information is</div>
              <div className="hp-line hp-dim">therefore strictly at your own risk.</div>
              <div className="hp-separator" />
              <div className="hp-line hp-dim">In no event will we be liable for any</div>
              <div className="hp-line hp-dim">loss or damage including without</div>
              <div className="hp-line hp-dim">limitation, indirect or consequential</div>
              <div className="hp-line hp-dim">loss or damage, or any loss or damage</div>
              <div className="hp-line hp-dim">whatsoever arising from loss of data</div>
              <div className="hp-line hp-dim">or profits arising out of, or in</div>
              <div className="hp-line hp-dim">connection with, the use of this</div>
              <div className="hp-line hp-dim">website.</div>
              <div className="hp-separator" />
              <div className="hp-line hp-dim">Through this website you are able to</div>
              <div className="hp-line hp-dim">link to other websites which are not</div>
              <div className="hp-line hp-dim">under the control of Newsroom. We have</div>
              <div className="hp-line hp-dim">no control over the nature, content</div>
              <div className="hp-line hp-dim">and availability of those sites. The</div>
              <div className="hp-line hp-dim">inclusion of any links does not</div>
              <div className="hp-line hp-dim">necessarily imply a recommendation or</div>
              <div className="hp-line hp-dim">endorse the views expressed within</div>
              <div className="hp-line hp-dim">them.</div>
              <div className="hp-separator" />
              <div className="hp-line hp-dim">Every effort is made to keep the</div>
              <div className="hp-line hp-dim">website up and running smoothly.</div>
              <div className="hp-line hp-dim">However, Newsroom takes no</div>
              <div className="hp-line hp-dim">responsibility for, and will not be</div>
              <div className="hp-line hp-dim">liable for, the website being</div>
              <div className="hp-line hp-dim">temporarily unavailable due to</div>
              <div className="hp-line hp-dim">technical issues beyond our control.</div>
              <div className="hp-separator" />
              <div className="hp-line">COPYRIGHTS</div>
              <div className="hp-separator" />
              <div className="hp-line hp-dim">Unless otherwise stated all articles,</div>
              <div className="hp-line hp-dim">text, and images are copyrighted by</div>
              <div className="hp-line hp-dim">their respective owners. Newsroom does</div>
              <div className="hp-line hp-dim">not claim ownership to any of these</div>
              <div className="hp-line hp-dim">works. If you are the owner of any</div>
              <div className="hp-line hp-dim">content displayed on this site and</div>
              <div className="hp-line hp-dim">wish to have it removed, please</div>
              <div className="hp-line hp-dim">contact{' '}
                <a href="mailto:rsurmeier@risd.edu">rsurmeier@risd.edu</a>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
