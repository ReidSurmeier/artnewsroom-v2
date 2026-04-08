'use client';

import { useState, useMemo, useCallback } from 'react';
import MiniSearch from 'minisearch';

interface ArticleSummary {
  id: string;
  title: string;
  source: string;
  excerpt: string | null;
}

interface SearchBarProps {
  articles: ArticleSummary[];
  onFilter: (ids: string[] | null) => void;
}

export default function SearchBar({ articles, onFilter }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const miniSearch = useMemo(() => {
    const ms = new MiniSearch({
      fields: ['title', 'source'],
      storeFields: ['id'],
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2 } },
    });
    ms.addAll(articles.map(a => ({ id: a.id, title: a.title, source: a.source })));
    return ms;
  }, [articles]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (!value.trim()) {
      onFilter(null);
      return;
    }
    const results = miniSearch.search(value);
    onFilter(results.map(r => r.id as string));
  }, [miniSearch, onFilter]);

  return (
    <input
      className="search-input"
      type="text"
      placeholder="Search..."
      value={query}
      onChange={e => handleChange(e.target.value)}
    />
  );
}
