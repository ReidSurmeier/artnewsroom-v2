use image::{DynamicImage, GenericImageView};
use std::path::Path;

const ASCII_CHARS: &[u8] = b" .:-=+*#%@";

pub fn image_to_ascii(img: &DynamicImage, width: u32) -> String {
    let aspect = img.height() as f64 / img.width() as f64;
    let height = (width as f64 * aspect * 0.5) as u32; // 0.5 for char aspect ratio
    if height == 0 || width == 0 {
        return String::new();
    }
    let resized = img.resize_exact(width, height, image::imageops::FilterType::Lanczos3);
    let gray = resized.grayscale();

    let mut result = String::new();
    for y in 0..height {
        for x in 0..width {
            let pixel = gray.get_pixel(x, y);
            let brightness = pixel[0] as usize;
            let idx = brightness * (ASCII_CHARS.len() - 1) / 255;
            result.push(ASCII_CHARS[idx] as char);
        }
        result.push('\n');
    }
    result
}

/// Extract image URLs from HTML content
pub fn find_image_urls(html: &str) -> Vec<String> {
    let doc = scraper::Html::parse_fragment(html);
    let sel = match scraper::Selector::parse("img") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let mut urls: Vec<String> = Vec::new();
    for el in doc.select(&sel) {
        if let Some(src) = el.value().attr("src") {
            let src = src.trim();
            if src.starts_with("http") && !src.contains("data:") {
                // Skip tiny icons/tracking pixels
                if src.contains("1x1") || src.contains("pixel") || src.contains("spacer") {
                    continue;
                }
                urls.push(src.to_string());
            }
        }
    }
    // Limit to first 5 images per article
    urls.truncate(5);
    urls
}

pub fn download_and_process(
    url: &str,
    article_id: &str,
    position: usize,
    data_dir: &Path,
) -> Option<(String, String)> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;

    let resp = client
        .get(url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let bytes = resp.bytes().ok()?;
    let img = image::load_from_memory(&bytes).ok()?;

    // ASCII art
    let ascii = image_to_ascii(&img, 120);

    // B&W image
    let gray = img.grayscale();
    let bw_dir = data_dir.join("images").join("bw");
    std::fs::create_dir_all(&bw_dir).ok()?;
    let bw_filename = format!("{}_{}.png", article_id, position);
    let bw_path = bw_dir.join(&bw_filename);
    gray.save(&bw_path).ok()?;

    Some((ascii, format!("/images/bw/{}", bw_filename)))
}
