use anyhow::{Context, Result};
use std::io::Read;
use std::time::Duration;

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Debug, Clone)]
pub struct FeedEntry {
    pub title: String,
    pub url: String,
    pub source_url: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub description: Option<String>,
}

pub fn fetch_feed(feed_url: &str) -> Result<Vec<FeedEntry>> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()?;

    let mut resp = client
        .get(feed_url)
        .send()
        .with_context(|| format!("HTTP request to {}", feed_url))?;

    if !resp.status().is_success() {
        anyhow::bail!("HTTP {} from {}", resp.status(), feed_url);
    }

    let mut body = String::new();
    resp.read_to_string(&mut body)
        .with_context(|| format!("reading body from {}", feed_url))?;

    let feed = feed_rs::parser::parse(body.as_bytes())
        .with_context(|| format!("parsing feed from {}", feed_url))?;

    let mut entries = Vec::new();
    for entry in feed.entries {
        let title = entry
            .title
            .map(|t| t.content)
            .unwrap_or_default();
        if title.is_empty() {
            continue;
        }

        let url = entry
            .links
            .first()
            .map(|l| l.href.clone())
            .or_else(|| entry.id.clone().into())
            .unwrap_or_default();
        if url.is_empty() || !url.starts_with("http") {
            continue;
        }

        let author = entry
            .authors
            .first()
            .map(|a| a.name.clone());

        let published_at = entry
            .published
            .or(entry.updated)
            .map(|dt| dt.to_rfc3339());

        let description = entry
            .summary
            .map(|s| s.content)
            .or_else(|| {
                entry.content.and_then(|c| c.body.map(|b| {
                    // Strip HTML tags for plain text description
                    strip_html_tags(&b)
                }))
            });

        entries.push(FeedEntry {
            title,
            url,
            source_url: Some(feed_url.to_string()),
            author,
            published_at,
            description,
        });
    }

    Ok(entries)
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    // Collapse whitespace
    let mut prev_space = false;
    let mut cleaned = String::with_capacity(result.len());
    for ch in result.chars() {
        if ch.is_whitespace() {
            if !prev_space {
                cleaned.push(' ');
                prev_space = true;
            }
        } else {
            cleaned.push(ch);
            prev_space = false;
        }
    }
    cleaned.trim().to_string()
}
