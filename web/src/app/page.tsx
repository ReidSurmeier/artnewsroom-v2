'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import TitleBar from '@/components/TitleBar';
import Sidebar from '@/components/Sidebar';
import PipelineDashboard from '@/components/PipelineDashboard';
import ArticleReader from '@/components/ArticleReader';
import AboutPage from '@/components/AboutPage';

interface ArticleRow {
  id: string;
  title: string;
  url: string;
  source: string;
  author: string | null;
  date_added: string;
  word_count: number;
  is_read: number;
  is_saved: number;
  is_archived: number;
  score: number;
  excerpt: string | null;
}

export default function HomePage() {
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [filterIds, setFilterIds] = useState<string[] | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  const loadArticles = useCallback((mode: 'active' | 'archived' | 'saved') => {
    const params = mode === 'archived' ? '?archived=true' : mode === 'saved' ? '?saved=true' : '';
    fetch(`/api/articles${params}`)
      .then(r => r.json())
      .then(setArticles)
      .catch(() => {});
    fetchedRef.current = mode;
  }, []);

  useEffect(() => {
    const mode = showArchive ? 'archived' : showSaved ? 'saved' : 'active';
    loadArticles(mode);
    fetch('/api/annotation-counts').then(r => r.json()).then(setAnnotationCounts).catch(() => {});
  }, [showArchive, showSaved, loadArticles]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setShowAbout(false);
    setArticles(prev => prev.map(a => a.id === id ? { ...a, is_read: 1 } : a));
  };

  const handleBack = () => {
    setSelectedId(null);
    setDrawMode(false);
    fetch('/api/annotation-counts').then(r => r.json()).then(setAnnotationCounts).catch(() => {});
  };

  const handleToggleArchive = () => {
    setShowArchive(v => !v);
    setShowSaved(false);
    setSelectedId(null);
    setShowAbout(false);
  };

  const handleToggleSaved = () => {
    setShowSaved(v => !v);
    setShowArchive(false);
    setSelectedId(null);
    setShowAbout(false);
  };

  const handleShowAbout = () => {
    setShowAbout(v => !v);
    setSelectedId(null);
  };

  const handleSave = async (articleId: string, saved: boolean) => {
    await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, saved }),
    });
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, is_saved: saved ? 1 : 0 } : a));
  };

  const handleArchive = async (articleId: string, archived: boolean) => {
    await fetch('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, archived }),
    });
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, is_archived: archived ? 1 : 0 } : a));
    if (archived) {
      setSelectedId(null);
      setDrawMode(false);
    }
  };

  const articleSummaries = articles.map(a => ({
    id: a.id,
    title: a.title,
    source: a.source,
    excerpt: a.excerpt,
  }));

  const selectedArticle = articles.find(a => a.id === selectedId);

  return (
    <div className={focusMode ? 'focus-mode' : ''}>
      <TitleBar
        articles={articleSummaries}
        onFilter={setFilterIds}
        showArchive={showArchive}
        onToggleArchive={handleToggleArchive}
        showSaved={showSaved}
        onToggleSaved={handleToggleSaved}
        articleSelected={!!selectedId}
        drawMode={drawMode}
        onToggleDraw={() => setDrawMode(v => !v)}
        focusMode={focusMode}
        onToggleFocus={() => setFocusMode(v => !v)}
        showAbout={showAbout}
        onShowAbout={handleShowAbout}
      />

      <Sidebar
        articles={articles}
        selectedId={selectedId}
        onSelect={handleSelect}
        annotationCounts={annotationCounts}
        filterIds={filterIds}
      />

      <main className={`content-area${selectedId ? ' article-open' : ''}`}>
        {showAbout ? (
          <AboutPage onClose={() => setShowAbout(false)} />
        ) : selectedId ? (
          <ArticleReader
            key={selectedId}
            articleId={selectedId}
            onBack={handleBack}
            focusMode={focusMode}
            drawMode={drawMode}
            isSaved={selectedArticle?.is_saved === 1}
            isArchived={selectedArticle?.is_archived === 1}
            onSave={handleSave}
            onArchive={handleArchive}
          />
        ) : (
          <PipelineDashboard onOpenAbout={handleShowAbout} />
        )}
      </main>
    </div>
  );
}
