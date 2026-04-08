use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use regex::Regex;
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

    // Full sanitization pipeline
    let sanitized = sanitize_html(html);
    let content_html = extract_content_from_clean(&sanitized);
    let post_cleaned = post_extraction_cleanup(&content_html);
    let final_html = final_text_cleanup(&post_cleaned);

    let content_markdown = html_to_markdown(&final_html);
    let word_count = content_markdown
        .split_whitespace()
        .filter(|w| w.len() > 1)
        .count();

    Ok(ExtractedArticle {
        title,
        author,
        image_url,
        content_html: final_html,
        content_markdown,
        word_count,
    })
}

fn extract_meta(doc: &Html, property: &str) -> Option<String> {
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

// ---------------------------------------------------------------------------
// Step 1: Pre-extraction element removal (regex-based on raw HTML string)
// ---------------------------------------------------------------------------

/// Regex to match an opening tag with a specific tag name, capturing up to the matching close.
/// We use non-greedy matching with the DOTALL flag.
fn tag_regex(tag: &str) -> Regex {
    Regex::new(&format!(
        r"(?is)<{tag}\b[^>]*>.*?</{tag}\s*>",
        tag = tag
    ))
    .unwrap()
}

/// Common container tags to match against for attribute-based removal.
/// Rust's regex crate doesn't support backreferences, so we iterate over known tags.
const CONTAINER_TAGS: &[&str] = &[
    "div", "section", "aside", "nav", "header", "footer", "form", "ul", "ol", "li",
    "span", "p", "article", "main", "figure", "blockquote", "table",
];

/// Remove elements (by known container tags) whose class or id contains a pattern.
fn strip_by_attr_pattern(html: &mut String, attr_pattern: &str) {
    for tag in CONTAINER_TAGS {
        let re = Regex::new(&format!(
            r#"(?is)<{tag}\b[^>]*(?:class|id)\s*=\s*"[^"]*{pat}[^"]*"[^>]*>.*?</{tag}\s*>"#,
            tag = tag,
            pat = attr_pattern
        ))
        .unwrap();
        *html = re.replace_all(html, "").to_string();
    }
}

/// Pre-strip selectors: tags to remove entirely
const PRE_STRIP_TAGS: &[&str] = &[
    "nav", "header", "footer", "aside", "form", "script", "style", "iframe", "noscript", "svg",
];

/// CSS-class/id based selectors to strip
const PRE_STRIP_CLASS_PATTERNS: &[&str] = &[
    "sidebar",
    "related-posts",
    "related-articles",
    r"(?:^|[\s-])related(?:[\s-]|$)",
    "newsletter",
    "newsletter-signup",
    "signup",
    r"(?:^|[\s-])subscribe(?:[\s-]|$)",
    r"(?:^|[\s-])cta(?:[\s-]|$)",
    "newsletter-box",
    "email-signup",
    "subscription",
    "social-share",
    "share-buttons",
    "sharing",
    "social-links",
    r"(?:^|[\s-])social(?:[\s-]|$)",
    "comments",
    "comment-section",
    "disqus",
    "advertisement",
    r"(?:^|[\s-])ad(?:[\s-]|$)",
    r"(?:^|[\s-])ads(?:[\s-]|$)",
    "ad-container",
    "advert",
    r"(?:^|[\s-])nav(?:[\s-]|$)",
    r"(?:^|[\s-])menu(?:[\s-]|$)",
    "breadcrumb",
    "site-header",
    "site-footer",
    "widget",
    "popup",
    "modal",
    "overlay",
    "cookie",
    "cookie-banner",
    "cookie-notice",
    "consent",
    "gdpr",
    "post-tags",
    "tag-list",
    "article-tags",
    "entry-tags",
    "tags",
    "categories",
    "taxonomies",
];

/// Broader attribute patterns — if class or id contains these substrings, strip.
const ATTR_KILL_PATTERNS: &[&str] = &[
    "cookie",
    "consent",
    "gdpr",
    "popup",
    "modal",
    "overlay",
    "banner",
    "alert",
    "notification",
    "toolbar",
    "skip",
    "sticky",
    "widget",
    "recommended",
    "trending",
    "popular",
    "most-read",
    "latest-news",
    "more-stories",
    "newsletter",
    "subscribe",
    "signup",
    "social",
    "sharing",
    "promo",
    "advert",
    "sponsor",
];

fn strip_role_elements(html: &mut String) {
    for tag in CONTAINER_TAGS {
        let re = Regex::new(&format!(
            r#"(?is)<{tag}\b[^>]*role\s*=\s*"(?:navigation|banner|complementary|contentinfo)"[^>]*>.*?</{tag}\s*>"#,
            tag = tag
        ))
        .unwrap();
        *html = re.replace_all(html, "").to_string();
    }
}

fn strip_hidden_elements(html: &mut String) {
    for tag in CONTAINER_TAGS {
        let re = Regex::new(&format!(
            r#"(?is)<{tag}\b[^>]*(?:hidden|aria-hidden\s*=\s*"true")[^>]*>.*?</{tag}\s*>"#,
            tag = tag
        ))
        .unwrap();
        *html = re.replace_all(html, "").to_string();
    }
}

fn sanitize_html(html: &str) -> String {
    let mut s = html.to_string();

    // Remove entire tags
    for tag in PRE_STRIP_TAGS {
        let re = tag_regex(tag);
        s = re.replace_all(&s, "").to_string();
    }

    // Remove role-based elements
    strip_role_elements(&mut s);

    // Remove hidden elements
    strip_hidden_elements(&mut s);

    // Remove elements by class/id pattern
    for pat in PRE_STRIP_CLASS_PATTERNS {
        strip_by_attr_pattern(&mut s, pat);
    }

    // Broad attribute kill patterns
    for pat in ATTR_KILL_PATTERNS {
        strip_by_attr_pattern(&mut s, pat);
    }

    s
}

// ---------------------------------------------------------------------------
// Step 2: Content extraction from sanitized HTML
// ---------------------------------------------------------------------------

const CONTENT_SELECTORS: &[&str] = &[
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

fn extract_content_from_clean(html: &str) -> String {
    let doc = Html::parse_document(html);

    for sel_str in CONTENT_SELECTORS {
        if let Ok(sel) = Selector::parse(sel_str) {
            if let Some(el) = doc.select(&sel).next() {
                let inner = el.html();
                let text_len = strip_all_tags(&inner).split_whitespace().count();
                if text_len > 50 {
                    return inner;
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
            return best_html;
        }
    }

    String::new()
}

// ---------------------------------------------------------------------------
// Step 3: Post-extraction cleanup
// ---------------------------------------------------------------------------

/// Section-eliminator heading patterns.
/// When a heading (h2-h4) or certain elements match these, remove that element
/// and everything after it within the same parent.
static RE_SECTION_KILL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(Related|More from|More of our|You may also like|Recommended|Read next|Also read|Read more|Subscribe|Sign up|Daily Newsletter|Weekly Newsletter|Get the latest|Join our|Don't miss|Further reading|More stories|Keep reading|Popular|Trending)").unwrap()
});

/// Line-level kill patterns — entire block removed if text matches.
static RE_LINE_KILL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:download\s+a\s+transcript|listen\s+and\s+subscribe|apple\s*\|\s*spotify|wherever\s+you\s+listen|sign\s+up\s+to\s+receive|sign\s+up\s+for\s+(?:the|our)\s+.*newsletter|subscribe\s+to\s+(?:the|our)\s+.*newsletter|get\s+the\s+.*newsletter|share\s+this\s+(?:article|story|post)|follow\s+us\s+on|related\s+articles?|more\s+from|more\s+of\s+our\s+favorite|recommended\s+for\s+you|you\s+might\s+also\s+like|read\s+more\s+about|subscribe\s+now|become\s+a\s+(?:subscriber|member)|already\s+a\s+subscriber|this\s+(?:article|story)\s+appears?\s+in|support\s+the\s+guardian|open\s+in\s+app|continue\s+reading|advertisement|click\s+here\s+to|tap\s+here\s+to|a\s+weekly\s+newsletter)").unwrap()
});

/// Photo credit patterns.
static RE_PHOTO_CREDIT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(?:Getty|AP\b|Reuters|Courtesy|Photo:|AFP|Alamy|Shutterstock|Photograph:|Image:|Image Credit:|Credit:)").unwrap()
});

fn post_extraction_cleanup(html: &str) -> String {
    let mut s = html.to_string();

    // (a) Section elimination: find headings that match kill pattern,
    //     remove from that heading to the next same-level heading or end.
    s = remove_kill_sections(&s);

    // (b) Line-level kill: remove <p>, <div>, <span>, <a> blocks matching patterns
    s = remove_line_kill_blocks(&s);

    // (c) Link-only paragraph removal
    s = remove_link_only_paragraphs(&s);

    // (d) Empty element removal
    s = remove_empty_elements(&s);

    // (e) Photo credit removal
    s = remove_photo_credits(&s);

    // (f) High link density removal
    s = remove_high_link_density(&s);

    s
}

/// Remove sections starting from kill-heading to end of parent context.
/// We match <h2>, <h3>, <h4> elements whose text matches the kill pattern,
/// then remove from that element to the next heading of same or higher level, or end.
fn remove_kill_sections(html: &str) -> String {
    let mut result = html.to_string();

    // For each heading level, find kill-pattern headings and remove from there to next same-level heading or end.
    for level in 2u8..=4 {
        let tag = format!("h{}", level);
        let re_heading = Regex::new(&format!(
            r"(?is)<{tag}\b[^>]*>(.*?)</{tag}\s*>",
            tag = tag
        ))
        .unwrap();

        loop {
            let mut found = false;
            if let Some(m) = re_heading.find(&result) {
                let caps = re_heading.captures(&result[m.start()..]).unwrap();
                let heading_text = strip_all_tags(&caps[1]);
                if RE_SECTION_KILL.is_match(&heading_text) {
                    let after_heading = m.end();
                    let rest = &result[after_heading..];

                    let next_heading_re = Regex::new(&format!(
                        r"(?is)<h[2-{}]\b[^>]*>",
                        level
                    ))
                    .unwrap();

                    let cut_end = if let Some(next_m) = next_heading_re.find(rest) {
                        after_heading + next_m.start()
                    } else {
                        result.len()
                    };

                    result = format!("{}{}", &result[..m.start()], &result[cut_end..]);
                    found = true;
                }
            }
            if !found {
                break;
            }
        }
    }

    // Also handle p/div/section/span elements that match kill patterns
    for tag in &["p", "div", "section", "span"] {
        let re = Regex::new(&format!(
            r"(?is)<{tag}\b[^>]*>(.*?)</{tag}\s*>",
            tag = tag
        ))
        .unwrap();

        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let inner_text = strip_all_tags(&caps[1]);
                if RE_SECTION_KILL.is_match(&inner_text) {
                    String::new()
                } else {
                    caps[0].to_string()
                }
            })
            .to_string();
    }

    result
}

/// Remove <p>, <div>, <span>, <a> blocks whose text matches line-kill patterns.
fn remove_line_kill_blocks(html: &str) -> String {
    let mut result = html.to_string();

    for tag in &["p", "div", "span", "a", "li", "section"] {
        let re = Regex::new(&format!(
            r"(?is)<{tag}\b[^>]*>(.*?)</{tag}\s*>",
            tag = tag
        ))
        .unwrap();

        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let inner_text = strip_all_tags(&caps[1]);
                if RE_LINE_KILL.is_match(&inner_text) {
                    String::new()
                } else {
                    caps[0].to_string()
                }
            })
            .to_string();
    }

    result
}

/// Remove <p> and <div> where non-link text content is less than 5 chars.
fn remove_link_only_paragraphs(html: &str) -> String {
    static RE_LINK: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?is)<a\b[^>]*>.*?</a\s*>").unwrap()
    });

    let mut result = html.to_string();
    for tag in &["p", "div"] {
        let re = Regex::new(&format!(
            r"(?is)<{tag}\b[^>]*>(.*?)</{tag}\s*>",
            tag = tag
        ))
        .unwrap();

        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let inner = &caps[1];
                let without_links = RE_LINK.replace_all(inner, "");
                let plain = strip_all_tags(&without_links);
                let trimmed = plain.trim();
                if trimmed.len() < 5 && !inner.contains("<img") {
                    String::new()
                } else {
                    caps[0].to_string()
                }
            })
            .to_string();
    }
    result
}

/// Remove <p> and <div> elements where trimmed text is empty and no <img>.
fn remove_empty_elements(html: &str) -> String {
    let mut result = html.to_string();
    for tag in &["p", "div"] {
        let re = Regex::new(&format!(
            r"(?is)<{tag}\b[^>]*>(.*?)</{tag}\s*>",
            tag = tag
        ))
        .unwrap();

        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let inner = &caps[1];
                let plain = strip_all_tags(inner);
                if plain.trim().is_empty() && !inner.contains("<img") {
                    String::new()
                } else {
                    caps[0].to_string()
                }
            })
            .to_string();
    }
    result
}

/// Remove elements whose text matches photo credit pattern and is under 80 chars.
fn remove_photo_credits(html: &str) -> String {
    let mut result = html.to_string();

    for tag in &["p", "div", "span", "figcaption", "cite", "em", "small"] {
        let re = Regex::new(&format!(
            r"(?is)<{tag}\b[^>]*>(.*?)</{tag}\s*>",
            tag = tag
        ))
        .unwrap();

        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let inner_text = strip_all_tags(&caps[1]);
                let trimmed = inner_text.trim();
                if trimmed.len() < 80 && RE_PHOTO_CREDIT.is_match(trimmed) {
                    String::new()
                } else {
                    caps[0].to_string()
                }
            })
            .to_string();
    }

    result
}

/// For <div> and <section>, if link text / total text > 0.5, remove.
fn remove_high_link_density(html: &str) -> String {
    static RE_LINK: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?is)<a\b[^>]*>(.*?)</a\s*>").unwrap()
    });

    let mut result = html.to_string();
    for tag in &["div", "section", "ul", "ol", "nav"] {
        let re = Regex::new(&format!(
            r"(?is)<{tag}\b[^>]*>(.*?)</{tag}\s*>",
            tag = tag
        ))
        .unwrap();

        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let inner = &caps[1];
                let total_text = strip_all_tags(inner);
                let total_len = total_text.trim().len();

                if total_len < 20 {
                    return caps[0].to_string();
                }

                let mut link_text_len = 0usize;
                for link_caps in RE_LINK.captures_iter(inner) {
                    let link_text = strip_all_tags(&link_caps[1]);
                    link_text_len += link_text.trim().len();
                }

                let ratio = link_text_len as f64 / total_len as f64;
                if ratio > 0.5 {
                    String::new()
                } else {
                    caps[0].to_string()
                }
            })
            .to_string();
    }
    result
}

// ---------------------------------------------------------------------------
// Step 4: Final text cleanup
// ---------------------------------------------------------------------------

static RE_MULTI_NEWLINES: Lazy<Regex> = Lazy::new(|| Regex::new(r"\n{3,}").unwrap());
static RE_SCRIPT_CONTENT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?is)<script\b[^>]*>.*?</script\s*>").unwrap());
static RE_STYLE_CONTENT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?is)<style\b[^>]*>.*?</style\s*>").unwrap());

fn final_text_cleanup(html: &str) -> String {
    let mut s = html.to_string();

    // Strip any remaining script/style tag content
    s = RE_SCRIPT_CONTENT.replace_all(&s, "").to_string();
    s = RE_STYLE_CONTENT.replace_all(&s, "").to_string();

    // Collapse 3+ consecutive newlines to 2
    s = RE_MULTI_NEWLINES.replace_all(&s, "\n\n").to_string();

    s.trim().to_string()
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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
                            let _ = href;
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
                    "script" | "style" | "nav" | "footer" | "aside" | "iframe" | "svg" => {
                        // Skip entirely
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }
}
