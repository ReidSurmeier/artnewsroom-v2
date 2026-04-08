# CONTRACTS.md — artnewsroom v3

## Architecture

```
artnewsroom-v2/
├── scraper/          # Rust binary — fetches, scores, stores articles
│   ├── Cargo.toml
│   └── src/
├── web/              # Next.js 14 — reads DB, serves UI, handles annotations
│   ├── package.json
│   └── src/
└── data/             # Shared SQLite database
    └── newsroom.db
```

## Runtime Boundary

- **Rust scraper** WRITES articles/candidates/sources/scan_logs. READS nothing from web.
- **Next.js web** READS articles/sources/scan_logs. WRITES annotations only.
- Both share `data/newsroom.db` via SQLite WAL mode (concurrent readers OK).

## Database Schema (SQLite)

```sql
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  feed_url TEXT,
  tier INTEGER NOT NULL DEFAULT 2,
  scrape_method TEXT NOT NULL DEFAULT 'rss',
  is_paywalled INTEGER DEFAULT 0,
  last_fetched TEXT,
  fetch_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  source_url TEXT,
  author TEXT,
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  score_breakdown TEXT,
  promoted INTEGER DEFAULT 0
);

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  source_url TEXT,
  author TEXT,
  published_at TEXT,
  scraped_at TEXT NOT NULL,
  content_html TEXT,
  content_markdown TEXT,
  excerpt TEXT,
  image_url TEXT,
  score INTEGER DEFAULT 0,
  score_breakdown TEXT,
  word_count INTEGER DEFAULT 0,
  is_read INTEGER DEFAULT 0,
  is_saved INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  quality_score REAL DEFAULT 0.0,
  date_added TEXT NOT NULL
);

CREATE TABLE annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  highlighted_text TEXT NOT NULL,
  note_text TEXT DEFAULT '',
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  anchor_prefix TEXT DEFAULT '',
  anchor_suffix TEXT DEFAULT '',
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  sources_scanned INTEGER DEFAULT 0,
  candidates_found INTEGER DEFAULT 0,
  articles_promoted INTEGER DEFAULT 0,
  errors TEXT
);

CREATE INDEX idx_articles_date ON articles(date_added);
CREATE INDEX idx_articles_source ON articles(source);
CREATE INDEX idx_articles_archived ON articles(is_archived);
CREATE INDEX idx_candidates_url ON candidates(url);
CREATE INDEX idx_candidates_promoted ON candidates(promoted);
CREATE INDEX idx_annotations_article ON annotations(article_id);
```

## Rust Scraper CLI

```
newsroom init-db          # Create tables
newsroom scan             # Fetch RSS, score, store candidates
newsroom promote          # Promote top candidates → articles (extract content)
newsroom scan-and-promote # Both in sequence (for cron)
newsroom sources          # List configured sources
newsroom stats            # DB stats
```

### Scoring (0-100)

| Factor | Range | Method |
|--------|-------|--------|
| Domain affinity | 0-30 | Match against Are.na taste profile domains |
| Keyword overlap | 0-40 | Title/description keyword matching |
| Source tier | 0-15 | Tier 1=15, 2=10, 3=20(indie boost), 4=5 |
| Recency | 0-15 | <1d=15, <3d=12, <7d=8, <14d=3, >14d=0 |
| Editorial | -50 to +25 | Always-pick/always-skip keyword lists |
| Paywall cap | max 45 | Hard cap for paywalled sources |

### Quality Gates (anti-slop)

Reject articles that:
- Have < 200 words extracted content
- Title contains non-article patterns (event listings, gallery hours, "save the date")
- Content is mostly boilerplate (nav, footer, sidebar leaked through)
- Published > 14 days ago (HARD cutoff, no exceptions)
- Duplicate title (normalized Levenshtein distance < 0.3)

### Recency Rule

**14-day maximum. No exceptions.** Articles older than 14 days are never stored.
Auto-archive articles older than 7 days from the active feed.

## Next.js API Routes

```
GET  /api/articles                    # List active articles (default) or ?archived=true or ?saved=true
GET  /api/articles/[id]               # Single article with content
POST /api/read                        # Mark article read { articleId }
POST /api/archive                     # Toggle archive { articleId, archived }
POST /api/save                        # Toggle save { articleId, saved }
GET  /api/annotations?articleId=ID    # Get annotations for article
POST /api/annotations                 # Create annotation
PUT  /api/annotations                 # Update annotation note
DELETE /api/annotations?id=ID         # Delete annotation
GET  /api/annotation-counts           # Counts per article for sidebar badges
GET  /api/sources                     # List sources from DB (for homepage dashboard)
GET  /api/status                      # Service status, scan logs, stats
```

## File Ownership

- **Rust specialist** owns: `scraper/**`
- **Frontend specialist** owns: `web/**`
- **Neither** touches: `CONTRACTS.md`, `data/` (created at runtime by Rust init-db)

## Success Criteria

1. `cargo build --release` succeeds in scraper/
2. `newsroom init-db` creates data/newsroom.db with all tables
3. `newsroom scan` fetches from 50+ sources, stores candidates
4. `newsroom promote` extracts content, stores articles
5. `npm run build` succeeds in web/
6. Homepage shows pipeline dashboard animation
7. Article reader displays content with working annotations
8. No lock emoji anywhere
9. No articles older than 14 days
10. No gibberish/slop articles (quality gate rejects them)
