'use client';

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: 'active' | 'archived' | 'saved';
  onViewMode: (m: 'active' | 'archived' | 'saved') => void;
  focusMode: boolean;
  onFocusMode: (v: boolean) => void;
  onAbout: () => void;
}

export default function TitleBar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewMode,
  focusMode,
  onFocusMode,
  onAbout,
}: Props) {
  const btnStyle = (active: boolean) => ({
    background: 'none',
    border: 'none',
    color: active ? '#aaa' : '#444',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '0.65rem',
    letterSpacing: '0.04em',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      borderBottom: '1px solid #1a1a1a',
      background: '#000',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: '0.65rem', color: '#333', letterSpacing: '0.08em', fontFamily: "'AUTHENTICSans-Condensed-90', monospace" }}>
        NEWSROOM
      </span>

      <input
        type="text"
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="search"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid #222',
          color: '#888',
          fontSize: '0.65rem',
          padding: '2px 4px',
          outline: 'none',
          maxWidth: '200px',
        }}
      />

      <button style={btnStyle(viewMode === 'active')} onClick={() => onViewMode('active')}>all</button>
      <button style={btnStyle(viewMode === 'archived')} onClick={() => onViewMode('archived')}>archive</button>
      <button style={btnStyle(viewMode === 'saved')} onClick={() => onViewMode('saved')}>saved</button>

      <button style={btnStyle(focusMode)} onClick={() => onFocusMode(!focusMode)}>focus</button>
      <button style={btnStyle(false)} onClick={onAbout}>about</button>
    </div>
  );
}
