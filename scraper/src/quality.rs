use chrono::{DateTime, Utc};

const NON_ARTICLE_PATTERNS: &[&str] = &[
    "save the date",
    "gallery hours",
    "opening reception",
    "rsvp",
    "job posting",
    "hiring",
    "call for",
    "deadline:",
    "submit by",
];

pub fn is_non_article_title(title: &str) -> bool {
    let lower = title.to_lowercase();
    NON_ARTICLE_PATTERNS.iter().any(|p| lower.contains(p))
}

pub fn is_too_old(published_at: Option<&str>) -> bool {
    let published = match published_at {
        Some(s) => match DateTime::parse_from_rfc3339(s) {
            Ok(dt) => dt.with_timezone(&Utc),
            Err(_) => return false, // can't parse, don't reject
        },
        None => return false,
    };
    let age = Utc::now() - published;
    age.num_days() > 14
}

const BOILERPLATE_PATTERNS: &[&str] = &[
    "subscribe to our newsletter",
    "sign up for our",
    "cookie policy",
    "privacy policy",
    "terms of service",
    "all rights reserved",
    "follow us on",
    "share this article",
    "related articles",
    "you may also like",
    "advertisement",
    "sponsored content",
    "accept cookies",
    "manage preferences",
    "unsubscribe",
    "powered by wordpress",
    "skip to content",
    "skip to main",
    "back to top",
    "load more",
    "show more",
    "read more articles",
    "join our mailing list",
    "enter your email",
];

pub fn is_mostly_boilerplate(html: &str) -> bool {
    let lower = html.to_lowercase();
    let total_len = lower.len();
    if total_len < 100 {
        return true;
    }

    let mut boilerplate_hits = 0u32;
    for pattern in BOILERPLATE_PATTERNS {
        let count = lower.matches(pattern).count() as u32;
        boilerplate_hits += count;
    }

    // Rough heuristic: if boilerplate phrases appear very frequently relative to content
    // Each hit ~= 30 chars of boilerplate on average
    let estimated_boilerplate_chars = boilerplate_hits as usize * 30;
    let ratio = estimated_boilerplate_chars as f64 / total_len as f64;
    ratio > 0.5
}
