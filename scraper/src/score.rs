use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

use crate::db::DbSource;
use crate::feeds::FeedEntry;

#[derive(Debug, Deserialize)]
struct TasteProfileRaw {
    domains: Vec<DomainEntry>,
    keywords: Vec<KeywordEntry>,
    #[allow(dead_code)]
    sources: Vec<SourceEntry>,
}

#[derive(Debug, Deserialize)]
struct DomainEntry {
    domain: String,
    count: u32,
}

#[derive(Debug, Deserialize)]
struct KeywordEntry {
    keyword: String,
    count: u32,
}

#[derive(Debug, Deserialize)]
struct SourceEntry {
    #[allow(dead_code)]
    source: String,
    #[allow(dead_code)]
    count: u32,
}

pub struct TasteProfile {
    pub domains: HashMap<String, u32>,
    pub keywords: HashMap<String, u32>,
}

impl TasteProfile {
    pub fn load() -> Result<Self> {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("../data/taste-profile.json");
        let data = std::fs::read_to_string(&path)?;
        let raw: TasteProfileRaw = serde_json::from_str(&data)?;

        let domains: HashMap<String, u32> = raw.domains.into_iter().map(|d| (d.domain, d.count)).collect();
        let keywords: HashMap<String, u32> = raw
            .keywords
            .into_iter()
            .filter(|k| k.keyword.len() >= 3) // skip very short noise
            .map(|k| (k.keyword.to_lowercase(), k.count))
            .collect();

        Ok(TasteProfile { domains, keywords })
    }
}

pub struct ScoreResult {
    pub total: i32,
    pub domain_affinity: i32,
    pub keyword_overlap: i32,
    pub source_tier: i32,
    pub recency: i32,
    pub editorial: i32,
    pub paywall_capped: bool,
}

impl ScoreResult {
    pub fn breakdown_json(&self) -> String {
        format!(
            r#"{{"domain":{},"keyword":{},"tier":{},"recency":{},"editorial":{},"paywall_capped":{}}}"#,
            self.domain_affinity,
            self.keyword_overlap,
            self.source_tier,
            self.recency,
            self.editorial,
            self.paywall_capped,
        )
    }
}

pub fn score_candidate(entry: &FeedEntry, source: &DbSource, taste: &TasteProfile) -> ScoreResult {
    let domain_affinity = score_domain(&entry.url, taste);
    let keyword_overlap = score_keywords(entry, taste);
    let source_tier = score_tier(source.tier);
    let recency = score_recency(entry.published_at.as_deref());
    let editorial = score_editorial(entry);

    let mut total = domain_affinity + keyword_overlap + source_tier + recency + editorial;

    // Reject if too old (recency returned -999)
    if recency < 0 {
        return ScoreResult {
            total: 0,
            domain_affinity,
            keyword_overlap,
            source_tier,
            recency,
            editorial,
            paywall_capped: false,
        };
    }

    let paywall_capped = source.is_paywalled && total > 45;
    if paywall_capped {
        total = 45;
    }

    total = total.max(0);

    ScoreResult {
        total,
        domain_affinity,
        keyword_overlap,
        source_tier,
        recency,
        editorial,
        paywall_capped,
    }
}

fn score_domain(url: &str, taste: &TasteProfile) -> i32 {
    let domain = extract_domain(url);
    if let Some(&count) = taste.domains.get(&domain) {
        let score = (10.0 * ((count as f64) + 1.0).log2()) as i32;
        score.min(30)
    } else {
        0
    }
}

fn extract_domain(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .map(|h| h.trim_start_matches("www.").to_string())
        .unwrap_or_default()
}

fn score_keywords(entry: &FeedEntry, taste: &TasteProfile) -> i32 {
    let text = format!(
        "{} {}",
        entry.title.to_lowercase(),
        entry.description.as_deref().unwrap_or("").to_lowercase()
    );
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return 0;
    }

    let mut total_weight = 0.0f64;
    let mut hits = 0u32;

    for (keyword, &count) in &taste.keywords {
        if text.contains(keyword.as_str()) {
            hits += 1;
            total_weight += ((count as f64) + 1.0).log2();
        }
    }

    if hits == 0 {
        return 0;
    }

    let hit_ratio = (hits as f64) / (words.len() as f64).max(1.0);
    let score = (hit_ratio * total_weight * 8.0) as i32;
    score.min(40)
}

fn score_tier(tier: i32) -> i32 {
    match tier {
        1 => 15,
        2 => 10,
        3 => 20, // indie boost
        4 => 5,
        _ => 0,
    }
}

fn score_recency(published_at: Option<&str>) -> i32 {
    let published = match published_at {
        Some(s) => match chrono::DateTime::parse_from_rfc3339(s) {
            Ok(dt) => dt.with_timezone(&chrono::Utc),
            Err(_) => return 8, // unknown date, give middle score
        },
        None => return 8, // no date, give middle score
    };

    let age = chrono::Utc::now() - published;
    let days = age.num_hours() as f64 / 24.0;

    if days < 0.0 {
        15 // future date (probably timezone issue), treat as very recent
    } else if days < 1.0 {
        15
    } else if days < 3.0 {
        12
    } else if days < 7.0 {
        8
    } else if days < 14.0 {
        3
    } else {
        -999 // reject: too old
    }
}

const ALWAYS_PICK: &[&str] = &[
    "interview",
    "artist",
    "sculpture",
    "painting",
    "curation",
    "essay",
    "contemporary art",
    "mfa",
    "risd",
    "technology criticism",
    "independent publishing",
    "digital art",
    "net art",
    "computational",
    "generative",
    "art history",
    "deep dive",
    "taste",
    "aesthetics",
    "photography",
    "theory",
    "philosophy",
    "media theory",
    "design criticism",
    "visual culture",
];

const ALWAYS_SKIP: &[&str] = &[
    "celebrity",
    "gossip",
    "red carpet",
    "fashion week",
    "tv review",
    "movie review",
    "finance",
    "crypto",
    "nft price",
    "lifestyle",
    "auction",
    "art market",
    "sotheby",
    "christie",
    "ai will replace",
    "listicle",
    "roundup",
    "best of",
    "product launch",
    "gadget",
    "tech review",
];

fn score_editorial(entry: &FeedEntry) -> i32 {
    let text = format!(
        "{} {}",
        entry.title.to_lowercase(),
        entry.description.as_deref().unwrap_or("").to_lowercase()
    );

    let mut score = 0i32;

    for kw in ALWAYS_PICK {
        if text.contains(kw) {
            score += 3;
        }
    }

    for kw in ALWAYS_SKIP {
        if text.contains(kw) {
            score -= 15;
        }
    }

    score.clamp(-50, 25)
}
