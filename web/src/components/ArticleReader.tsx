'use client';

import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { marked } from 'marked';

interface ArticleWithContent {
  id: string;
  title: string;
  url: string;
  source: string;
  source_url: string | null;
  author: string | null;
  published_at: string | null;
  content_html: string | null;
  content_markdown: string | null;
  word_count: number;
  is_saved: number;
  is_archived: number;
  score: number;
}

interface AnnotationRow {
  id: number;
  article_id: string;
  highlighted_text: string;
  note_text: string;
  start_offset: number;
  end_offset: number;
  created_at: string;
  anchor_prefix: string;
  anchor_suffix: string;
}

interface ArticleImage {
  id: number;
  article_id: string;
  original_url: string;
  ascii_art: string;
  bw_image_path: string;
  alt_text: string;
  position: number;
}

interface Props {
  articleId: string;
  onBack: () => void;
  focusMode?: boolean;
  drawMode?: boolean;
  onSave?: (articleId: string, saved: boolean) => Promise<void>;
  onArchive?: (articleId: string, archived: boolean) => Promise<void>;
  isSaved?: boolean;
  isArchived?: boolean;
}

function highlightRange(range: Range, annotationId: number): void {
  const fragment = range.extractContents();
  const mark = document.createElement('mark');
  mark.className = 'annotated-highlight';
  mark.dataset.annotationId = String(annotationId);
  mark.appendChild(fragment);
  range.insertNode(mark);
}

function restoreHighlight(
  el: HTMLElement,
  annotation: AnnotationRow
): void {
  const text = el.textContent ?? '';
  const { start_offset, end_offset, anchor_prefix, anchor_suffix } = annotation;

  // Try to find the exact position using prefix context
  let start = start_offset;
  let end = end_offset;

  // Validate: check surrounding text matches prefix/suffix
  const prefixMatch = text.slice(Math.max(0, start - anchor_prefix.length), start);
  const suffixMatch = text.slice(end, end + anchor_suffix.length);
  if (anchor_prefix && !prefixMatch.endsWith(anchor_prefix.slice(-10))) {
    // Fallback: search for highlighted_text in document
    const needle = annotation.highlighted_text;
    const idx = text.indexOf(needle);
    if (idx === -1) return;
    start = idx;
    end = idx + needle.length;
  }

  // Walk text nodes to create range
  let charCount = 0;
  let startNode: Node | null = null;
  let startOff = 0;
  let endNode: Node | null = null;
  let endOff = 0;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const nodeLen = (node.textContent ?? '').length;
    if (startNode === null && charCount + nodeLen >= start) {
      startNode = node;
      startOff = start - charCount;
    }
    if (endNode === null && charCount + nodeLen >= end) {
      endNode = node;
      endOff = end - charCount;
      break;
    }
    charCount += nodeLen;
  }

  if (!startNode || !endNode) return;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    highlightRange(range, annotation.id);
  } catch {
    // Skip gracefully
  }
}

const ArticleContent = memo(function ArticleContent({
  html,
  contentRef,
}: {
  html: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="article-content"
      ref={contentRef}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}, (prev, next) => prev.html === next.html);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripImages(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, '')
    .replace(/<div class="ascii-art-container">[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<div class="ascii-art-container">[\s\S]*?<\/div>/gi, '');
}

export default function ArticleReader({
  articleId,
  onBack,
  focusMode = false,
  drawMode = false,
  onSave,
  onArchive,
  isSaved,
  isArchived,
}: Props) {
  const [article, setArticle] = useState<ArticleWithContent | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationRow[]>([]);
  const [articleImages, setArticleImages] = useState<ArticleImage[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [savedState, setSavedState] = useState(false);
  const [archivedState, setArchivedState] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);

  const contentRef = useRef<HTMLDivElement>(null);
  const marginRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const highlightedIdsRef = useRef<Set<number>>(new Set());
  const restoredForArticleRef = useRef<string | null>(null);

  // Drawing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawTool, setDrawTool] = useState<'pen' | 'eraser'>('pen');
  const [drawPaths, setDrawPaths] = useState<{ tool: string; points: { x: number; y: number }[] }[]>([]);
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);

  // ── Data loading ──
  useEffect(() => {
    setAnnotations([]);
    setEditingAnnotation(null);
    highlightedIdsRef.current = new Set();
    restoredForArticleRef.current = null;
    setDrawPaths([]);

    fetch(`/api/articles/${articleId}`)
      .then(r => r.json())
      .then((data: ArticleWithContent) => {
        setArticle(data);
        setSavedState(data.is_saved === 1);
        setArchivedState(data.is_archived === 1);
      })
      .catch(() => {});

    fetch(`/api/article-images?articleId=${encodeURIComponent(articleId)}`)
      .then(r => r.json())
      .then(setArticleImages)
      .catch(() => {});

    fetch(`/api/annotations?articleId=${encodeURIComponent(articleId)}`)
      .then(r => r.json())
      .then((data: AnnotationRow[]) => setAnnotations(data))
      .catch(() => {});

    fetch(`/api/drawings?articleId=${encodeURIComponent(articleId)}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.drawing_data) {
          try { setDrawPaths(JSON.parse(data.drawing_data)); } catch { /* ignore */ }
        }
      })
      .catch(() => {});

    // Mark read
    fetch('/api/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId }),
    }).catch(() => {});
  }, [articleId]);

  // ── Focus mode reading progress ──
  useEffect(() => {
    if (!focusMode) return;
    const el = document.querySelector('.content-area');
    if (!el) return;
    const handleScroll = () => {
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      if (scrollHeight > 0) setReadingProgress(Math.min(1, scrollTop / scrollHeight));
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [focusMode]);

  // ── Rendered HTML with ASCII art substitution ──
  const renderedHtml = useMemo(() => {
    let html = '';
    if (article?.content_html) html = article.content_html;
    else if (article?.content_markdown) html = marked.parse(article.content_markdown) as string;

    let imgIndex = 0;
    html = html.replace(/<img[^>]*>/gi, () => {
      const img = articleImages[imgIndex];
      imgIndex++;
      if (!img || !img.ascii_art) return '';
      const alt = img.alt_text ? `<div class="ascii-caption">${escapeHtml(img.alt_text)}</div>` : '';
      return `<div class="ascii-art-container"><pre class="ascii-art">${escapeHtml(img.ascii_art)}</pre>${alt}</div>`;
    });

    return html;
  }, [article?.content_html, article?.content_markdown, articleImages]);

  // ── Scale ASCII art to fill container width ──
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const scaleAsciiArt = () => {
      const pres = content.querySelectorAll<HTMLPreElement>('pre.ascii-art');
      pres.forEach(pre => {
        const lines = pre.textContent?.split('\n') ?? [];
        const charCount = Math.max(...lines.map(l => l.length));
        if (!charCount) return;
        const containerWidth = content.offsetWidth;
        let fontSize = containerWidth / (charCount * 0.602);
        pre.style.fontSize = `${fontSize}px`;
        pre.style.lineHeight = `${fontSize * 1.35}px`;
        let attempts = 0;
        while (pre.scrollWidth > containerWidth + 1 && attempts < 20) {
          fontSize *= containerWidth / pre.scrollWidth;
          pre.style.fontSize = `${fontSize}px`;
          pre.style.lineHeight = `${fontSize * 1.35}px`;
          attempts++;
        }
      });
    };
    scaleAsciiArt();
    window.addEventListener('resize', scaleAsciiArt);
    return () => window.removeEventListener('resize', scaleAsciiArt);
  }, [renderedHtml]);

  // ── Annotation: handle text selection → create ──
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !article || focusMode || drawMode) return;

    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
      const text = sel.toString().trim();
      if (text.length < 2) return;

      // Compute character offsets
      const fullText = el.textContent ?? '';
      const preRange = document.createRange();
      preRange.selectNodeContents(el);
      preRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preRange.toString().length;
      const endOffset = startOffset + text.length;

      const anchorPrefix = fullText.slice(Math.max(0, startOffset - 20), startOffset);
      const anchorSuffix = fullText.slice(endOffset, endOffset + 20);

      // Highlight in DOM immediately
      const tempId = -Date.now();
      try {
        highlightRange(range, tempId);
      } catch { /* skip */ }
      sel.removeAllRanges();

      fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: articleId,
          highlighted_text: text,
          note_text: '',
          start_offset: startOffset,
          end_offset: endOffset,
          anchor_prefix: anchorPrefix,
          anchor_suffix: anchorSuffix,
        }),
      })
        .then(r => r.json())
        .then((data: AnnotationRow) => {
          el.querySelectorAll(`mark[data-annotation-id="${tempId}"]`).forEach(m => {
            m.setAttribute('data-annotation-id', String(data.id));
          });
          highlightedIdsRef.current.add(data.id);
          setAnnotations(prev => [...prev, data]);
          setEditingAnnotation(data.id);
          setEditNoteText('');
        })
        .catch(() => {});
    };

    el.addEventListener('mouseup', handleMouseUp);
    return () => el.removeEventListener('mouseup', handleMouseUp);
  }, [article, articleId, focusMode, drawMode]);

  // ── Restore highlights on article load ──
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !article || annotations.length === 0) return;
    if (restoredForArticleRef.current === articleId) return;
    if (annotations[0].article_id !== articleId) return;

    restoredForArticleRef.current = articleId;

    annotations.forEach(ann => {
      if (highlightedIdsRef.current.has(ann.id)) return;
      restoreHighlight(el, ann);
      highlightedIdsRef.current.add(ann.id);
    });
  }, [article, annotations, articleId, renderedHtml]);

  // ── Position margin notes next to highlights ──
  useEffect(() => {
    const margin = marginRef.current;
    if (!margin || annotations.length === 0) return;

    const positionNotes = () => {
      const noteEls = margin.querySelectorAll<HTMLElement>('.annotation-note');
      let lastBottom = 0;
      noteEls.forEach(noteEl => {
        const annId = noteEl.dataset.annotationId;
        const highlight = contentRef.current?.querySelector<HTMLElement>(
          `mark.annotated-highlight[data-annotation-id="${annId}"]`
        );
        if (highlight) {
          const marginRect = margin.getBoundingClientRect();
          const highlightRect = highlight.getBoundingClientRect();
          let targetTop = highlightRect.top - marginRect.top + margin.scrollTop;
          if (targetTop < lastBottom + 8) targetTop = lastBottom + 8;
          noteEl.style.top = `${targetTop}px`;
          noteEl.style.display = '';
          lastBottom = targetTop + noteEl.offsetHeight;
        } else {
          noteEl.style.display = 'none';
        }
      });
    };

    const t = setTimeout(positionNotes, 80);
    window.addEventListener('resize', positionNotes);
    const contentArea = document.querySelector('.content-area');
    const scrollHandler = () => requestAnimationFrame(positionNotes);
    contentArea?.addEventListener('scroll', scrollHandler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', positionNotes);
      contentArea?.removeEventListener('scroll', scrollHandler);
    };
  }, [annotations, editingAnnotation]);

  // ── Annotation CRUD ──
  const handleSaveAnnotation = async (id: number) => {
    await fetch('/api/annotations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, note_text: editNoteText }),
    });
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, note_text: editNoteText } : a));
    setEditingAnnotation(null);
  };

  const handleDeleteAnnotation = async (id: number) => {
    await fetch(`/api/annotations?id=${id}`, { method: 'DELETE' });
    const el = contentRef.current;
    if (el) {
      const marks = el.querySelectorAll(`mark.annotated-highlight[data-annotation-id="${id}"]`);
      marks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
          while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
          parent.removeChild(mark);
        }
      });
      el.normalize();
    }
    highlightedIdsRef.current.delete(id);
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  // ── Save / Archive ──
  const handleToggleSave = async () => {
    const next = !savedState;
    setSavedState(next);
    if (onSave) {
      await onSave(articleId, next);
    } else {
      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, saved: next }),
      });
    }
  };

  const handleToggleArchive = async () => {
    const next = !archivedState;
    setArchivedState(next);
    if (onArchive) {
      await onArchive(articleId, next);
    } else {
      await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, archived: next }),
      });
    }
  };

  const handleSaveNotes = async () => {
    // No dedicated notes field in v2 schema — skip silently
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  // ── Drawing ──
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPaths.forEach(path => {
      if (path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.tool === 'eraser' ? 'rgba(255,255,255,1)' : '#000';
      ctx.lineWidth = path.tool === 'eraser' ? 12 : 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });
  }, [drawPaths]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.scrollWidth;
      canvas.height = parent.scrollHeight;
      redrawCanvas();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [redrawCanvas, article]);

  useEffect(() => { redrawCanvas(); }, [drawPaths, redrawCanvas]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDrawStart = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    setIsDrawing(true);
    currentPathRef.current = [getCanvasPoint(e)];
  };

  const handleDrawMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode || !isDrawing) return;
    const pt = getCanvasPoint(e);
    currentPathRef.current.push(pt);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const points = currentPathRef.current;
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = drawTool === 'eraser' ? 'rgba(255,255,255,1)' : '#000';
    ctx.lineWidth = drawTool === 'eraser' ? 12 : 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
  };

  const handleDrawEnd = () => {
    if (!drawMode || !isDrawing) return;
    setIsDrawing(false);
    if (currentPathRef.current.length > 1) {
      const newPaths = [...drawPaths, { tool: drawTool, points: currentPathRef.current }];
      setDrawPaths(newPaths);
      fetch('/api/drawings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, drawingData: JSON.stringify(newPaths) }),
      }).catch(() => {});
    }
    currentPathRef.current = [];
  };

  const handleClearDrawing = () => {
    setDrawPaths([]);
    fetch('/api/drawings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, drawingData: JSON.stringify([]) }),
    }).catch(() => {});
  };

  if (!article) return null;

  const effectiveSaved = isSaved !== undefined ? isSaved : savedState;
  const effectiveArchived = isArchived !== undefined ? isArchived : archivedState;

  return (
    <div
      className={`article-reader-wrapper${panelOpen ? ' panel-open' : ''}`}
      ref={wrapperRef}
    >
      {focusMode && (
        <div className="reading-progress" style={{ width: `${readingProgress * 100}%` }} />
      )}

      {drawMode && (
        <div className="draw-toolbar">
          <button className={`draw-tool-btn${drawTool === 'pen' ? ' active' : ''}`} onClick={() => setDrawTool('pen')}>Pen</button>
          <button className={`draw-tool-btn${drawTool === 'eraser' ? ' active' : ''}`} onClick={() => setDrawTool('eraser')}>Eraser</button>
          <button className="draw-tool-btn" onClick={handleClearDrawing}>Clear</button>
        </div>
      )}

      <div className={`article-reader-with-margin${!focusMode ? ' has-margin' : ''}`}>
        <div className="article-reader">
          {!focusMode && (
            <div className="article-top-actions">
              <button className="back-btn" onClick={onBack}>&larr; Back</button>
              <div className="article-action-btns">
                <button
                  className={`save-btn${effectiveSaved ? ' saved' : ''}`}
                  onClick={handleToggleSave}
                >
                  {effectiveSaved ? 'Saved' : 'Save'}
                </button>
                <button
                  className={`archive-btn${effectiveArchived ? ' archived' : ''}`}
                  onClick={handleToggleArchive}
                >
                  {effectiveArchived ? 'Unarchive' : 'Archive'}
                </button>
              </div>
            </div>
          )}

          <h1 className="article-title">{article.title}</h1>

          {!focusMode && (
            <div className="article-meta">
              {article.author && <>{article.author} &middot; </>}
              <a href={article.source_url ?? article.url} target="_blank" rel="noopener noreferrer">
                {article.source}
              </a>
              {article.published_at && (
                <> &middot; {new Date(article.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</>
              )}
              {article.word_count > 0 && (
                <> &middot; {Math.round(article.word_count / 200)}min read</>
              )}
            </div>
          )}

          <ArticleContent
            html={focusMode ? stripImages(renderedHtml) : renderedHtml}
            contentRef={contentRef}
          />

          {(drawMode || drawPaths.length > 0) && (
            <canvas
              ref={canvasRef}
              className={`draw-canvas${drawMode ? ' active' : ''}${drawPaths.length > 0 ? ' has-paths' : ''}`}
              onMouseDown={handleDrawStart}
              onMouseMove={handleDrawMove}
              onMouseUp={handleDrawEnd}
              onMouseLeave={handleDrawEnd}
            />
          )}

          {!focusMode && articleImages.length > 0 && (
            <div className="images-section">
              <button className="references-toggle" onClick={() => setImagesOpen(!imagesOpen)}>
                {imagesOpen ? '\u25be' : '\u25b8'} Images ({articleImages.length})
              </button>
              {imagesOpen && (
                <div className="images-gallery">
                  {articleImages.map(img => (
                    <div key={img.id} className="bw-image-item">
                      <img src={img.bw_image_path} alt={img.alt_text || ''} className="bw-image" />
                      {img.alt_text && <div className="bw-image-caption">{img.alt_text}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Annotation margin */}
        {!focusMode && (
          <div className="annotation-margin" ref={marginRef}>
            {annotations.map(ann => (
              <div key={ann.id} className="annotation-note" data-annotation-id={ann.id}>
                <div className="annotation-connector" />
                <div className="annotation-highlight-preview">
                  &ldquo;{ann.highlighted_text.slice(0, 60)}{ann.highlighted_text.length > 60 ? '\u2026' : ''}&rdquo;
                </div>
                {editingAnnotation === ann.id ? (
                  <div className="annotation-edit">
                    <textarea
                      className="annotation-textarea"
                      value={editNoteText}
                      onChange={e => setEditNoteText(e.target.value)}
                      placeholder="Write a note..."
                      ref={el => { if (el) el.focus({ preventScroll: true }); }}
                    />
                    <div className="annotation-actions">
                      <button className="annotation-save-btn" onClick={() => handleSaveAnnotation(ann.id)}>Save</button>
                      <button className="annotation-cancel-btn" onClick={() => setEditingAnnotation(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="annotation-display">
                    {ann.note_text && <div className="annotation-text">{ann.note_text}</div>}
                    <div className="annotation-actions">
                      <button
                        className="annotation-edit-btn"
                        onClick={() => { setEditingAnnotation(ann.id); setEditNoteText(ann.note_text); }}
                      >
                        Edit
                      </button>
                      <button
                        className="annotation-delete-btn"
                        onClick={() => handleDeleteAnnotation(ann.id)}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!focusMode && (
        <>
          <button className="side-panel-tab" onClick={() => setPanelOpen(!panelOpen)}>Notes</button>

          {panelOpen && (
            <div className="side-panel">
              <div className="side-panel-header">
                <h3>Notes</h3>
                <button className="side-panel-close" onClick={() => setPanelOpen(false)}>&times;</button>
              </div>
              <textarea
                className="notes-textarea"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Write notes here..."
              />
              <div className="side-panel-actions">
                <button className="notes-save-btn" onClick={handleSaveNotes}>Save</button>
                {notesSaved && <span className="notes-saved">Saved</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
