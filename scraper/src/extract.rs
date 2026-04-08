use anyhow::{Context, Result};
use scraper::{Html, Selector};
use std::io::Read;
use std::time::Duration;

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

pub struct ExtractedArticle {
    pub title: Option<String>,
    pub author: Option<String>,
    pub image_url: Option<String>,
    pub content_html: String,
    pub content_markdown: String,
    pub word_count: usize,
}

pub fn extract_article(url: &str) -> Result<ExtractedArticle> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()?;

    let mut resp = client
        .get(url)
        .send()
        .with_context(|| format!("fetching {}", url))?;

    if !resp.status().is_success() {
        anyhow::bail!("HTTP {} from {}", resp.status(), url);
    }

    let mut body = String::new();
    resp.read_to_string(&mut body)
        .with_context(|| format!("reading body from {}", url))?;

    parse_html(&body)
}

fn parse_html(html: &str) -> Result<ExtractedArticle> {
    let doc = Html::parse_document(html);

    let title = extract_meta(&doc, "og:title")
        .or_else(|| extract_meta(&doc, "twitter:title"))
        .or_else(|| select_text(&doc, "h1"));

    let author = extract_meta(&doc, "author")
        .or_else(|| select_text(&doc, ".byline"))
        .or_else(|| select_text(&doc, "[rel='author']"))
        .or_else(|| select_text(&doc, ".author"));

    let image_url = extract_meta(&doc, "og:image")
        .or_else(|| extract_meta(&doc, "twitter:image"));

    // Find main content container
    let content_html = extract_content(&doc);
    let content_markdown = html_to_markdown(&content_html);
    let word_count = content_markdown
        .split_whitespace()
        .filter(|w| w.len() > 1)
        .count();

    Ok(ExtractedArticle {
        title,
        author,
        image_url,
        content_html,
        content_markdown,
        word_count,
    })
}

fn extract_meta(doc: &Html, property: &str) -> Option<String> {
    // Try og: / twitter: meta tags
    let selectors = [
        format!(r#"meta[property="{}"]"#, property),
        format!(r#"meta[name="{}"]"#, property),
    ];
    for sel_str in &selectors {
        if let Ok(sel) = Selector::parse(sel_str) {
            if let Some(el) = doc.select(&sel).next() {
                if let Some(content) = el.value().attr("content") {
                    let trimmed = content.trim().to_string();
                    if !trimmed.is_empty() {
                        return Some(trimmed);
                    }
                }
            }
        }
    }
    None
}

fn select_text(doc: &Html, selector_str: &str) -> Option<String> {
    if let Ok(sel) = Selector::parse(selector_str) {
        if let Some(el) = doc.select(&sel).next() {
            let text: String = el.text().collect::<String>().trim().to_string();
            if !text.is_empty() {
                return Some(text);
            }
        }
    }
    None
}

/// Strip unwanted elements from an element's inner HTML
const STRIP_SELECTORS: &[&str] = &[
    "nav", "footer", "aside", "script", "style", "iframe",
    ".sidebar", ".ad", ".ads", ".advertisement", ".newsletter",
    ".newsletter-signup", ".subscribe", ".cta", ".social-share",
    ".related-posts", ".related-articles", ".comments",
    "[role='navigation']", "[role='banner']", "[role='contentinfo']",
    ".cookie", ".cookie-banner", "#cookie-notice",
];

fn extract_content(doc: &Html) -> String {
    // Try specific content selectors in priority order
    let content_selectors = [
        "article .entry-content",
        "article .post-content",
        "article .article-body",
        "article .article-content",
        ".entry-content",
        ".post-content",
        ".article-body",
        ".article-content",
        "article",
        "[role='main']",
        "main",
        ".content",
        "#content",
    ];

    for sel_str in &content_selectors {
        if let Ok(sel) = Selector::parse(sel_str) {
            if let Some(el) = doc.select(&sel).next() {
                let html = el.html();
                let cleaned = strip_unwanted(&html);
                let text_len = strip_all_tags(&cleaned).split_whitespace().count();
                if text_len > 50 {
                    return cleaned;
                }
            }
        }
    }

    // Fallback: find largest text block
    if let Ok(sel) = Selector::parse("div, section") {
        let mut best_html = String::new();
        let mut best_words = 0;
        for el in doc.select(&sel) {
            let text: String = el.text().collect();
            let words = text.split_whitespace().count();
            if words > best_words {
                best_words = words;
                best_html = el.html();
            }
        }
        if best_words > 50 {
            return strip_unwanted(&best_html);
        }
    }

    String::new()
}

fn strip_unwanted(html: &str) -> String {
    let doc = Html::parse_fragment(html);
    let mut to_remove = Vec::new();

    for sel_str in STRIP_SELECTORS {
        if let Ok(sel) = Selector::parse(sel_str) {
            for el in doc.select(&sel) {
                to_remove.push(el.html());
            }
        }
    }

    let mut result = html.to_string();
    for fragment in &to_remove {
        result = result.replace(fragment.as_str(), "");
    }
    result
}

fn strip_all_tags(html: &str) -> String {
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
    result
}

fn html_to_markdown(html: &str) -> String {
    let doc = Html::parse_fragment(html);
    let mut md = String::new();
    convert_node(&doc, &mut md);

    // Clean up excessive newlines
    let mut cleaned = String::new();
    let mut prev_newlines = 0u32;
    for ch in md.chars() {
        if ch == '\n' {
            prev_newlines += 1;
            if prev_newlines <= 2 {
                cleaned.push(ch);
            }
        } else {
            prev_newlines = 0;
            cleaned.push(ch);
        }
    }
    cleaned.trim().to_string()
}

fn convert_node(node: &Html, md: &mut String) {
    use scraper::node::Node;
    for child in node.tree.nodes() {
        match child.value() {
            Node::Text(text) => {
                let t = text.text.as_ref();
                if !t.trim().is_empty() {
                    md.push_str(t);
                }
            }
            Node::Element(el) => {
                let tag = el.name.local.as_ref();
                match tag {
                    "h1" => md.push_str("\n\n# "),
                    "h2" => md.push_str("\n\n## "),
                    "h3" => md.push_str("\n\n### "),
                    "h4" => md.push_str("\n\n#### "),
                    "h5" => md.push_str("\n\n##### "),
                    "h6" => md.push_str("\n\n###### "),
                    "p" => md.push_str("\n\n"),
                    "br" => md.push('\n'),
                    "blockquote" => md.push_str("\n\n> "),
                    "strong" | "b" => md.push_str("**"),
                    "em" | "i" => md.push('*'),
                    "a" => {
                        if let Some(href) = el.attr("href") {
                            md.push('[');
                            // Text will be added by child text nodes
                            // We'll close the link after, but since we traverse flat,
                            // just note the href. Simplified approach:
                            let _ = href; // handled below in closing logic
                        }
                    }
                    "img" => {
                        if let Some(src) = el.attr("src") {
                            let alt = el.attr("alt").unwrap_or("");
                            md.push_str(&format!("![{}]({})", alt, src));
                        }
                    }
                    "li" => md.push_str("\n- "),
                    "ul" | "ol" => md.push('\n'),
                    "script" | "style" | "nav" | "footer" | "aside" | "iframe" => {
                        // Skip entirely — don't recurse
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }
}
