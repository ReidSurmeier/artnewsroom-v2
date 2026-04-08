'use client';

import { useMemo, useState } from 'react';

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

interface Props {
  articles: ArticleRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  annotationCounts: Record<string, number>;
  searchQuery: string;
}

function groupByDate(articles: ArticleRow[]): Map<string, ArticleRow[]> {
  const groups = new Map<string, ArticleRow[]>();
  for (const a of articles) {
    const date = a.date_added.slice(0, 10);
    const existing = groups.get(date);
    if (existing) {
      existing.push(a);
    } else {
      groups.set(date, [a]);
    }
  }
  return groups;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Sidebar({ articles, selectedId, onSelect, annotationCounts, searchQuery }: Props) {
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return articles;
    const q = searchQuery.toLowerCase();
    return articles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.source.toLowerCase().includes(q) ||
      (a.author ?? '').toLowerCase().includes(q)
    );
  }, [articles, searchQuery]);

  // Top 3 longest articles (diverse sources)
  const featured = useMemo(() => {
    const seen = new Set<string>();
    const sorted = [...articles].sort((a, b) => b.word_count - a.word_count);
    const result: ArticleRow[] = [];
    for (const a of sorted) {
      if (!seen.has(a.source)) {
        seen.add(a.source);
        result.push(a);
        if (result.length === 3) break;
      }
    }
    return result;
  }, [articles]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const dates = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

  const toggleDate = (date: string) => {
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const renderArticle = (article: ArticleRow) => {
    const isSelected = article.id === selectedId;
    const annotCount = annotationCounts[article.id] ?? 0;
    return (
      <div
        key={article.id}
        onClick={() => onSelect(article.id)}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          borderBottom: '1px solid #1a1a1a',
          opacity: article.is_read ? 0.4 : 1,
          background: isSelected ? '#111' : 'transparent',
          borderLeft: isSelected ? '2px solid #666' : '2px solid transparent',
        }}
      >
        <div style={{
          fontSize: '0.75rem',
          lineHeight: 1.3,
          color: isSelected ? '#ddd' : '#aaa',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {article.title}
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '3px', fontSize: '0.6rem', color: '#555' }}>
          <span>{article.source}</span>
          {article.author && <span>&middot; {article.author}</span>}
          {article.word_count > 0 && <span>&middot; {Math.round(article.word_count / 200)}m</span>}
          {annotCount > 0 && (
            <span style={{ color: '#777', marginLeft: 'auto' }}>[{annotCount}]</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Featured section */}
      {featured.length > 0 && !searchQuery && (
        <div style={{ borderBottom: '1px solid #222' }}>
          <div style={{
            padding: '6px 12px',
            fontSize: '0.6rem',
            color: '#444',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            long reads
          </div>
          {featured.map(renderArticle)}
        </div>
      )}

      {/* Date-grouped list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {dates.map(date => {
          const items = grouped.get(date) ?? [];
          const collapsed = collapsedDates.has(date);
          return (
            <div key={date}>
              <div
                onClick={() => toggleDate(date)}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.6rem',
                  color: '#444',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #1a1a1a',
                  userSelect: 'none',
                }}
              >
                <span>{formatDate(date)}</span>
                <span>{collapsed ? '+' : '-'} {items.length}</span>
              </div>
              {!collapsed && items.map(renderArticle)}
            </div>
          );
        })}

        {dates.length === 0 && (
          <div style={{ padding: '20px 12px', color: '#444', fontSize: '0.7rem' }}>
            {searchQuery ? 'no results' : 'no articles'}
          </div>
        )}
      </div>
    </div>
  );
}
