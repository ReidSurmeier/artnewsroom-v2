'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

interface ArticleWithContent {
  id: string;
  title: string;
  url: string;
  source: string;
  author: string | null;
  published_at: string | null;
  content_html: string | null;
  content_markdown: string | null;
  word_count: number;
  is_saved: number;
  is_archived: number;
  score: number;
}

interface Props {
  articleId: string;
  onBack: () => void;
  focusMode: boolean;
}

interface SelectionInfo {
  text: string;
  startOffset: number;
  endOffset: number;
  prefix: string;
  suffix: string;
  x: number;
  y: number;
}

export default function ArticleReader({ articleId, onBack, focusMode }: Props) {
  const [article, setArticle] = useState<ArticleWithContent | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationRow[]>([]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState('');
  const [readProgress, setReadProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const [archived, setArchived] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setArticle(null);
    setAnnotations([]);
    setSelection(null);

    fetch(`/api/articles/${articleId}`)
      .then(r => r.json())
      .then((a: ArticleWithContent) => {
        setArticle(a);
        setSaved(a.is_saved === 1);
        setArchived(a.is_archived === 1);
      })
      .catch(() => {});

    fetch(`/api/annotations?articleId=${articleId}`)
      .then(r => r.json())
      .then(setAnnotations)
      .catch(() => {});

    // Mark read
    fetch('/api/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId }) }).catch(() => {});
  }, [articleId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const progress = el.scrollTop / (el.scrollHeight - el.clientHeight);
    setReadProgress(Math.min(1, Math.max(0, progress)));
  }, []);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current) return;
    const text = sel.toString().trim();
    if (!text || text.length < 3) return;

    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(contentRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;
    const endOffset = startOffset + text.length;

    const fullText = contentRef.current.textContent ?? '';
    const prefix = fullText.slice(Math.max(0, startOffset - 20), startOffset);
    const suffix = fullText.slice(endOffset, endOffset + 20);

    const rect = range.getBoundingClientRect();
    setSelection({
      text,
      startOffset,
      endOffset,
      prefix,
      suffix,
      x: rect.left + rect.width / 2,
      y: rect.bottom + window.scrollY,
    });
  }, []);

  const createAnnotation = async () => {
    if (!selection) return;
    const res = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        article_id: articleId,
        highlighted_text: selection.text,
        note_text: '',
        start_offset: selection.startOffset,
        end_offset: selection.endOffset,
        anchor_prefix: selection.prefix,
        anchor_suffix: selection.suffix,
      }),
    });
    const ann = await res.json() as AnnotationRow;
    setAnnotations(prev => [...prev, ann]);
    setSelection(null);
    setEditingId(ann.id);
    setEditNote('');
    window.getSelection()?.removeAllRanges();
  };

  const saveNote = async () => {
    if (editingId === null) return;
    await fetch('/api/annotations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, note_text: editNote }),
    });
    setAnnotations(prev => prev.map(a => a.id === editingId ? { ...a, note_text: editNote } : a));
    setEditingId(null);
    setEditNote('');
  };

  const deleteAnnotation = async (id: number) => {
    await fetch(`/api/annotations?id=${id}`, { method: 'DELETE' });
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditNote('');
    }
  };

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId, saved: next }) });
  };

  const toggleArchive = async () => {
    const next = !archived;
    setArchived(next);
    await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId, archived: next }) });
  };

  if (!article) {
    return (
      <div style={{ padding: '40px', color: '#444', fontSize: '0.75rem' }}>
        loading...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      {/* Progress bar */}
      {focusMode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: '#222',
          zIndex: 100,
        }}>
          <div style={{
            width: `${readProgress * 100}%`,
            height: '100%',
            background: '#666',
            transition: 'width 0.1s',
          }} />
        </div>
      )}

      {/* Main content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px',
          maxWidth: '720px',
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '24px',
          fontSize: '0.65rem',
          color: '#444',
        }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0, fontSize: '0.65rem' }}
          >
            back
          </button>
          <span style={{ flex: 1 }} />
          <button
            onClick={toggleSave}
            style={{ background: 'none', border: '1px solid #333', color: saved ? '#aaa' : '#555', cursor: 'pointer', padding: '2px 8px', fontSize: '0.6rem' }}
          >
            {saved ? 'saved' : 'save'}
          </button>
          <button
            onClick={toggleArchive}
            style={{ background: 'none', border: '1px solid #333', color: archived ? '#aaa' : '#555', cursor: 'pointer', padding: '2px 8px', fontSize: '0.6rem' }}
          >
            {archived ? 'archived' : 'archive'}
          </button>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#444', fontSize: '0.6rem' }}
          >
            original
          </a>
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '1.4rem',
          fontWeight: 400,
          lineHeight: 1.3,
          color: '#ccc',
          marginBottom: '12px',
          fontFamily: "'AUTHENTICSans-90', sans-serif",
        }}>
          {article.title}
        </h1>

        {/* Meta */}
        <div style={{ fontSize: '0.65rem', color: '#444', marginBottom: '32px', display: 'flex', gap: '8px' }}>
          <span>{article.source}</span>
          {article.author && <><span>&middot;</span><span>{article.author}</span></>}
          {article.published_at && (
            <><span>&middot;</span><span>{new Date(article.published_at).toLocaleDateString()}</span></>
          )}
          {article.word_count > 0 && (
            <><span>&middot;</span><span>{Math.round(article.word_count / 200)}min read</span></>
          )}
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          onMouseUp={handleMouseUp}
          className="article-content"
          style={{ position: 'relative' }}
          dangerouslySetInnerHTML={{ __html: article.content_html ?? article.content_markdown ?? '<p>No content available.</p>' }}
        />

        {/* Selection tooltip */}
        {selection && (
          <div
            style={{
              position: 'fixed',
              left: `${selection.x}px`,
              top: `${selection.y + 8}px`,
              transform: 'translateX(-50%)',
              background: '#111',
              border: '1px solid #333',
              padding: '4px 10px',
              fontSize: '0.65rem',
              color: '#aaa',
              cursor: 'pointer',
              zIndex: 50,
            }}
            onClick={createAnnotation}
          >
            annotate
          </div>
        )}

        <div style={{ height: '120px' }} />
      </div>

      {/* Annotations panel */}
      {annotations.length > 0 && !focusMode && (
        <div style={{
          width: '240px',
          borderLeft: '1px solid #1a1a1a',
          overflowY: 'auto',
          padding: '32px 12px',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '0.6rem', color: '#444', marginBottom: '16px', letterSpacing: '0.08em' }}>
            NOTES
          </div>
          {annotations.map(ann => (
            <div key={ann.id} style={{ marginBottom: '16px', borderBottom: '1px solid #1a1a1a', paddingBottom: '12px' }}>
              <div style={{
                fontSize: '0.65rem',
                color: '#666',
                fontStyle: 'italic',
                marginBottom: '4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                &ldquo;{ann.highlighted_text}&rdquo;
              </div>

              {editingId === ann.id ? (
                <div>
                  <textarea
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%',
                      background: '#0a0a0a',
                      border: '1px solid #333',
                      color: '#aaa',
                      fontSize: '0.65rem',
                      padding: '4px',
                      resize: 'vertical',
                      minHeight: '60px',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote();
                      if (e.key === 'Escape') { setEditingId(null); setEditNote(''); }
                    }}
                  />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <button onClick={saveNote} style={{ fontSize: '0.6rem', color: '#666', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      save
                    </button>
                    <button onClick={() => { setEditingId(null); setEditNote(''); }} style={{ fontSize: '0.6rem', color: '#444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {ann.note_text && (
                    <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '4px' }}>
                      {ann.note_text}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => { setEditingId(ann.id); setEditNote(ann.note_text); }}
                      style={{ fontSize: '0.6rem', color: '#444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      {ann.note_text ? 'edit' : 'add note'}
                    </button>
                    <button
                      onClick={() => deleteAnnotation(ann.id)}
                      style={{ fontSize: '0.6rem', color: '#333', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
