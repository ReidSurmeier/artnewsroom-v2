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

type ViewMode = 'active' | 'archived' | 'saved';

export default function HomePage() {
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const fetchedMode = useRef<ViewMode | null>(null);

  const loadArticles = useCallback((mode: ViewMode) => {
    const params = mode === 'archived' ? '?archived=true' : mode === 'saved' ? '?saved=true' : '';
    fetch(`/api/articles${params}`)
      .then(r => r.json())
      .then(setArticles)
      .catch(() => {});
    fetchedMode.current = mode;
  }, []);

  useEffect(() => {
    loadArticles(viewMode);
    fetch('/api/annotation-counts').then(r => r.json()).then(setAnnotationCounts).catch(() => {});
  }, [viewMode, loadArticles]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setShowAbout(false);
    setArticles(prev => prev.map(a => a.id === id ? { ...a, is_read: 1 } : a));
  };

  const handleBack = () => {
    setSelectedId(null);
    fetch('/api/annotation-counts').then(r => r.json()).then(setAnnotationCounts).catch(() => {});
  };

  const handleViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    setSelectedId(null);
  };

  const showSidebar = !focusMode;

  return (
    <div className="app-root">
      <TitleBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewMode={handleViewMode}
        focusMode={focusMode}
        onFocusMode={setFocusMode}
        onAbout={() => { setShowAbout(v => !v); setSelectedId(null); }}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {showSidebar && (
          <div className="sidebar">
            <Sidebar
              articles={articles}
              selectedId={selectedId}
              onSelect={handleSelect}
              annotationCounts={annotationCounts}
              searchQuery={searchQuery}
            />
          </div>
        )}

        <div className="content-area" style={{ padding: 0 }}>
          {showAbout ? (
            <AboutPage onClose={() => setShowAbout(false)} />
          ) : selectedId ? (
            <ArticleReader
              key={selectedId}
              articleId={selectedId}
              onBack={handleBack}
              focusMode={focusMode}
            />
          ) : (
            <PipelineDashboard onOpenAbout={() => setShowAbout(true)} />
          )}
        </div>
      </div>
    </div>
  );
}
