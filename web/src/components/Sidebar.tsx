'use client';

import { useState, useMemo } from 'react';

interface ArticleRow {
  id: string;
  title: string;
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
  filterIds: string[] | null;
}

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (date >= todayStart) return 'Today';
  if (date >= yesterdayStart) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDaySortKey(dateStr: string): string {
  return dateStr.slice(0, 10);
}

export default function Sidebar({ articles, selectedId, onSelect, annotationCounts, filterIds }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!filterIds) return articles;
    const idSet = new Set(filterIds);
    return articles.filter(a => idSet.has(a.id));
  }, [articles, filterIds]);

  // Top 3: long-form (2000+ words), diverse sources
  const top3 = useMemo(() => {
    const MIN_WORDS = 2000;
    const longForm = filtered.filter(a => a.word_count >= MIN_WORDS);
    const result: ArticleRow[] = [];
    const usedSources = new Set<string>();
    for (const a of longForm) {
      if (result.length >= 3) break;
      if (usedSources.has(a.source)) continue;
      result.push(a);
      usedSources.add(a.source);
    }
    return result;
  }, [filtered]);

  const top3Ids = useMemo(() => new Set(top3.map(a => a.id)), [top3]);
  const rest = useMemo(() => filtered.filter(a => !top3Ids.has(a.id)), [filtered, top3Ids]);

  const dayGroups = useMemo(() => {
    const groups: { key: string; label: string; articles: ArticleRow[] }[] = [];
    const groupMap = new Map<string, ArticleRow[]>();
    const labelMap = new Map<string, string>();

    for (const a of rest) {
      const key = getDaySortKey(a.date_added);
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
        labelMap.set(key, getDayLabel(a.date_added));
      }
      groupMap.get(key)!.push(a);
    }

    const sortedKeys = [...groupMap.keys()].sort((a, b) => b.localeCompare(a));
    for (const key of sortedKeys) {
      groups.push({ key, label: labelMap.get(key)!, articles: groupMap.get(key)! });
    }
    return groups;
  }, [rest]);

  const toggleDay = (key: string) => {
    setOpenDays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderArticle = (article: ArticleRow) => {
    const annCount = annotationCounts[article.id] ?? 0;
    return (
      <li
        key={article.id}
        className={`sidebar-item${article.id === selectedId ? ' active' : ''}${article.is_read ? ' read' : ''}`}
        onClick={() => onSelect(article.id)}
      >
        <span className="sidebar-item-title">
          {article.title}
          {annCount > 0 && <span className="annotation-count-badge">{annCount}</span>}
        </span>
        <span className="sidebar-item-source">{article.source}</span>
      </li>
    );
  };

  return (
    <nav className="sidebar">
      <ul>
        {top3.map(renderArticle)}
      </ul>

      {rest.length > 0 && (
        <>
          <button
            className="sidebar-more-toggle"
            onClick={() => setMoreOpen(!moreOpen)}
          >
            {moreOpen ? '\u25be' : '\u25b8'} More ({rest.length})
          </button>
          {moreOpen && dayGroups.map(group => (
            <div key={group.key}>
              <button
                className="sidebar-day-toggle"
                onClick={() => toggleDay(group.key)}
              >
                {openDays.has(group.key) ? '\u25be' : '\u25b8'} {group.label} ({group.articles.length})
              </button>
              {openDays.has(group.key) && (
                <ul>
                  {group.articles.map(renderArticle)}
                </ul>
              )}
            </div>
          ))}
        </>
      )}
    </nav>
  );
}
