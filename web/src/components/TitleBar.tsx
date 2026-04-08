'use client';

import { useState, useRef, useEffect } from 'react';
import SearchBar from './SearchBar';

interface ArticleSummary {
  id: string;
  title: string;
  source: string;
  excerpt: string | null;
}

interface TitleBarProps {
  articles: ArticleSummary[];
  onFilter: (ids: string[] | null) => void;
  showArchive: boolean;
  onToggleArchive: () => void;
  showSaved?: boolean;
  onToggleSaved?: () => void;
  articleSelected?: boolean;
  drawMode?: boolean;
  onToggleDraw?: () => void;
  focusMode?: boolean;
  onToggleFocus?: () => void;
  showAbout?: boolean;
  onShowAbout?: () => void;
}

export default function TitleBar({
  articles,
  onFilter,
  showArchive,
  onToggleArchive,
  showSaved,
  onToggleSaved,
  articleSelected,
  drawMode,
  onToggleDraw,
  focusMode,
  onToggleFocus,
  showAbout,
  onShowAbout,
}: TitleBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <header className={`title-bar${focusMode ? ' focus-mode-bar' : ''}`}>
      {focusMode ? (
        <>
          <h1>NEWSROOM</h1>
          <div className="title-bar-actions">
            <button className="titlebar-mode-btn active" onClick={() => { onToggleFocus?.(); setMenuOpen(false); }}>
              EXIT FOCUS
            </button>
          </div>
        </>
      ) : (
        <>
          <h1>NEWSROOM</h1>
          <div className="title-bar-actions">
            <button
              className={`titlebar-about-btn${showAbout ? ' active' : ''}`}
              onClick={() => onShowAbout?.()}
            >
              About
            </button>
            <div className="titlebar-menu-container" ref={menuRef}>
              <button
                className={`titlebar-menu-btn${menuOpen ? ' active' : ''}`}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                &#9776;
              </button>
              {menuOpen && (
                <div className="titlebar-dropdown">
                  {articleSelected && (
                    <>
                      <button
                        className={`titlebar-dropdown-item${drawMode ? ' active' : ''}`}
                        onClick={() => { onToggleDraw?.(); setMenuOpen(false); }}
                      >
                        {drawMode ? '&#10003; ' : ''}DRAW
                      </button>
                      <button
                        className="titlebar-dropdown-item"
                        onClick={() => { onToggleFocus?.(); setMenuOpen(false); }}
                      >
                        FOCUS
                      </button>
                    </>
                  )}
                  <button
                    className={`titlebar-dropdown-item${showSaved ? ' active' : ''}`}
                    onClick={() => { onToggleSaved?.(); setMenuOpen(false); }}
                  >
                    {showSaved ? '← Feed' : 'Saved'}
                  </button>
                  <button
                    className={`titlebar-dropdown-item${showArchive ? ' active' : ''}`}
                    onClick={() => { onToggleArchive(); setMenuOpen(false); }}
                  >
                    {showArchive ? '← Feed' : 'Archive'}
                  </button>
                </div>
              )}
            </div>
            <SearchBar articles={articles} onFilter={onFilter} />
          </div>
        </>
      )}
    </header>
  );
}
