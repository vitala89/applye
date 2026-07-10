// CV tailoring — cache CRUD for 3-pass results + DOCX/PDF export.
// Cache key: input_hash covers all inputs for a given pass (including upstream
// pass results), so a different pass-1 output invalidates the pass-2 cache.
// Export: DOCX via docx-rs (ATS-reliable); PDF via printpdf 0.7 (pure Rust).
// Files land in <app_data>/companies/<company>/cv/<hash12>.<ext>.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::db::Db;

// ── Tailoring cache ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TailoringCache {
    pub id: i64,
    pub job_id: i64,
    pub pass: i64,
    pub input_hash: String,
    pub result_md: String,
    pub changes_json: Option<String>,
    pub gaps_json: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTailoringInput {
    pub job_id: i64,
    pub pass: i64,
    pub input_hash: String,
    pub result_md: String,
    pub changes_json: String,
    pub gaps_json: String,
    pub model_used: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
}

#[tauri::command]
pub async fn tailoring_cache_get(
    job_id: i64,
    pass: i64,
    input_hash: String,
    db: State<'_, Db>,
) -> Result<Option<TailoringCache>, String> {
    sqlx::query_as::<_, TailoringCache>(
        "SELECT * FROM tailoring_cache WHERE job_id=? AND pass=? AND input_hash=? LIMIT 1",
    )
    .bind(job_id)
    .bind(pass)
    .bind(&input_hash)
    .fetch_optional(&db.pool)
    .await
    .map_err(|e| format!("tailoring_cache_get: {e}"))
}

#[tauri::command]
pub async fn tailoring_cache_save(
    input: SaveTailoringInput,
    db: State<'_, Db>,
) -> Result<TailoringCache, String> {
    sqlx::query(
        "INSERT INTO tailoring_cache
           (job_id, pass, input_hash, result_md, changes_json, gaps_json,
            model_used, tokens_input, tokens_output, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(job_id, pass, input_hash) DO UPDATE SET
           result_md     = excluded.result_md,
           changes_json  = excluded.changes_json,
           gaps_json     = excluded.gaps_json,
           model_used    = excluded.model_used,
           tokens_input  = excluded.tokens_input,
           tokens_output = excluded.tokens_output,
           created_at    = excluded.created_at",
    )
    .bind(input.job_id)
    .bind(input.pass)
    .bind(&input.input_hash)
    .bind(&input.result_md)
    .bind(&input.changes_json)
    .bind(&input.gaps_json)
    .bind(&input.model_used)
    .bind(input.tokens_input)
    .bind(input.tokens_output)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("tailoring_cache_save: {e}"))?;

    sqlx::query_as::<_, TailoringCache>(
        "SELECT * FROM tailoring_cache WHERE job_id=? AND pass=? AND input_hash=? LIMIT 1",
    )
    .bind(input.job_id)
    .bind(input.pass)
    .bind(&input.input_hash)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| format!("tailoring_cache_save reload: {e}"))
}

// ── Generated docs ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDoc {
    pub id: i64,
    pub job_id: i64,
    pub doc_type: String,
    pub export_format: String,
    pub input_hash: String,
    pub file_path: String,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn generated_doc_get(
    job_id: i64,
    input_hash: String,
    export_format: String,
    db: State<'_, Db>,
) -> Result<Option<GeneratedDoc>, String> {
    fetch_generated_doc(job_id, &input_hash, &export_format, &db).await
}

async fn fetch_generated_doc(
    job_id: i64,
    input_hash: &str,
    export_format: &str,
    db: &Db,
) -> Result<Option<GeneratedDoc>, String> {
    sqlx::query_as::<_, GeneratedDoc>(
        "SELECT * FROM generated_docs
         WHERE job_id=? AND input_hash=? AND export_format=? AND doc_type='cv' LIMIT 1",
    )
    .bind(job_id)
    .bind(input_hash)
    .bind(export_format)
    .fetch_optional(&db.pool)
    .await
    .map_err(|e| format!("generated_doc_get: {e}"))
}

async fn upsert_generated_doc(
    job_id: i64,
    input_hash: &str,
    export_format: &str,
    file_path: &str,
    db: &Db,
) -> Result<GeneratedDoc, String> {
    sqlx::query(
        "INSERT OR REPLACE INTO generated_docs
           (job_id, doc_type, export_format, input_hash, file_path, created_at)
         VALUES (?, 'cv', ?, ?, ?, datetime('now'))",
    )
    .bind(job_id)
    .bind(export_format)
    .bind(input_hash)
    .bind(file_path)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("generated_doc upsert: {e}"))?;

    sqlx::query_as::<_, GeneratedDoc>(
        "SELECT * FROM generated_docs
         WHERE job_id=? AND doc_type='cv' AND export_format=? AND input_hash=? LIMIT 1",
    )
    .bind(job_id)
    .bind(export_format)
    .bind(input_hash)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| format!("generated_doc reload: {e}"))
}

/// Kebab-case slug: non-alphanum → hyphen, collapse runs, cap at max_len.
fn readable_slug(s: &str, max_len: usize) -> String {
    let mut out = String::new();
    let mut last_hyphen = true;
    for c in s.chars() {
        if c.is_alphanumeric() {
            out.push(c);
            last_hyphen = false;
        } else if !last_hyphen {
            out.push('-');
            last_hyphen = true;
        }
    }
    let out = out.trim_end_matches('-');
    let cap = out
        .char_indices()
        .nth(max_len)
        .map(|(i, _)| i)
        .unwrap_or(out.len());
    out[..cap].to_string()
}

fn cv_dir(app: &AppHandle, company: &str, title: &str) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let src = if !company.is_empty() {
        company
    } else if !title.is_empty() {
        title
    } else {
        "Other"
    };
    let dir = base
        .join("companies")
        .join(readable_slug(src, 40))
        .join("cv");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    Ok(dir)
}

fn cv_filename(title: &str, company: &str, hash: &str, ext: &str) -> String {
    let src = if !title.is_empty() {
        title
    } else if !company.is_empty() {
        company
    } else {
        "CV"
    };
    let slug = readable_slug(src, 48);
    let suffix = &hash[..8.min(hash.len())];
    format!("{slug}_{suffix}.{ext}")
}

// ── Shared export styling ─────────────────────────────────────────────────────
//
// Both exporters (DOCX via docx-rs, PDF via printpdf) render from one structured
// block list so their output stays in lockstep, and both honor the user's
// `CvStyle` (font / size / colour / weight, plus per-section and per-paragraph
// overrides) instead of hardcoding a look. The style cascade mirrors the editor
// utils `effectiveSectionStyle` / `effectiveCoverLetterParagraphStyle` exactly so
// what the user sees in the editor is what lands in the file.
//
// Honest limit: printpdf ships only the 14 PDF base fonts, so an arbitrary
// user font (Calibri, Lato, …) is mapped to the nearest base family in PDF
// (sans→Helvetica, serif→Times, mono→Courier). DOCX carries the real font name.

use crate::commands::documents::CvStyle;

/// Logical role of a block — drives relative size scale and spacing so both
/// renderers agree on hierarchy without hardcoding absolute sizes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BlockLevel {
    H1,
    H2,
    H3,
    Body,
    Bullet,
}

impl BlockLevel {
    /// Multiplier applied to the section's effective point size.
    fn scale(self) -> f64 {
        match self {
            BlockLevel::H1 => 1.6,
            BlockLevel::H2 => 1.3,
            BlockLevel::H3 => 1.15,
            BlockLevel::Body | BlockLevel::Bullet => 1.0,
        }
    }
    fn is_heading(self) -> bool {
        matches!(self, BlockLevel::H1 | BlockLevel::H2 | BlockLevel::H3)
    }
}

/// One logical line to render, tagged with the section/block it belongs to so
/// per-section style overrides resolve correctly. `bold` marks inline-emphasised
/// body lines (entry titles, the cover-letter subject).
pub(crate) struct StyledBlock {
    pub level: BlockLevel,
    pub section_key: Option<String>,
    pub text: String,
    pub bold: bool,
}

/// A block with its style fully resolved — renderers consume this and stay
/// agnostic of the CV-vs-cover-letter cascade rules.
pub(crate) struct RenderBlock {
    pub level: BlockLevel,
    pub font_family: String,
    pub size_pt: f64,
    pub rgb: (u8, u8, u8),
    pub bold: bool,
    pub text: String,
    /// Section this block belongs to; the DOCX renderer uses
    /// `Some("personal_details")` to find the leading blocks for the
    /// photo-beside-header table cell in side placements.
    pub section_key: Option<String>,
}

struct EffStyle {
    font_family: String,
    size_pt: f64,
    weight: i64,
    rgb: (u8, u8, u8),
}

fn hex_to_rgb(hex: &str) -> (u8, u8, u8) {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 {
        return (51, 51, 51); // #333333 default — matches CV_STYLE_DEFAULT
    }
    let byte = |a: usize, b: usize| u8::from_str_radix(&h[a..b], 16).ok();
    match (byte(0, 2), byte(2, 4), byte(4, 6)) {
        (Some(r), Some(g), Some(b)) => (r, g, b),
        _ => (51, 51, 51),
    }
}

/// Concrete page geometry in millimetres, resolved from `PageSettings`.
pub(crate) struct PageConfig {
    pub width_mm: f32,
    pub height_mm: f32,
    pub margin: crate::commands::documents::PageMargins,
}

fn clamp_mm(v: f32) -> f32 {
    v.clamp(0.0, 50.0)
}

/// Mirrors the TS `resolvePageSettings`. Accepts legacy presets and 4-side mm;
/// unknown size falls back to A4 so a malformed `style_json` never breaks export.
pub(crate) fn resolve_page(p: &crate::commands::documents::PageSettings) -> PageConfig {
    use crate::commands::documents::{MarginSpec, PageMargins};
    let (width_mm, height_mm) = match p.size.as_str() {
        "letter" => (215.9, 279.4),
        _ => (210.0, 297.0),
    };
    let margin = match &p.margin {
        MarginSpec::Preset(s) => {
            let mm = match s.as_str() {
                "narrow" => 12.7,
                "wide" => 30.0,
                _ => 20.0,
            };
            PageMargins {
                top: mm,
                right: mm,
                bottom: mm,
                left: mm,
            }
        }
        MarginSpec::Sides(m) => PageMargins {
            top: clamp_mm(m.top),
            right: clamp_mm(m.right),
            bottom: clamp_mm(m.bottom),
            left: clamp_mm(m.left),
        },
    };
    PageConfig {
        width_mm,
        height_mm,
        margin,
    }
}

/// CV cascade: per-section override field ?? document-wide field. Mirrors the
/// TS `effectiveSectionStyle`.
fn effective_cv(style: &CvStyle, key: Option<&str>) -> EffStyle {
    let o = key.and_then(|k| style.section_styles.get(k));
    EffStyle {
        font_family: o
            .and_then(|s| s.font_family.clone())
            .unwrap_or_else(|| style.font_family.clone()),
        size_pt: o.and_then(|s| s.font_size_pt).unwrap_or(style.font_size_pt),
        weight: o.and_then(|s| s.font_weight).unwrap_or(style.font_weight),
        rgb: hex_to_rgb(
            o.and_then(|s| s.color_hex.as_deref())
                .unwrap_or(&style.accent_color_hex),
        ),
    }
}

/// Cover-letter cascade: a `body_<i>` paragraph override ?? the `body` block
/// style ?? document-wide. Mirrors the TS `effectiveCoverLetterParagraphStyle`.
fn effective_cl(style: &CvStyle, key: Option<&str>) -> EffStyle {
    match key {
        Some(k) if k.starts_with("body_") => {
            let base = effective_cv(style, Some("body"));
            let o = style.section_styles.get(k);
            EffStyle {
                font_family: o
                    .and_then(|s| s.font_family.clone())
                    .unwrap_or(base.font_family),
                size_pt: o.and_then(|s| s.font_size_pt).unwrap_or(base.size_pt),
                weight: o.and_then(|s| s.font_weight).unwrap_or(base.weight),
                rgb: o
                    .and_then(|s| s.color_hex.as_deref())
                    .map(hex_to_rgb)
                    .unwrap_or(base.rgb),
            }
        }
        _ => effective_cv(style, key),
    }
}

/// Resolves every block's effective style once, up front. `cover_letter` picks
/// the paragraph-aware cascade. A block renders bold when it is a heading, was
/// tagged inline-bold, or its effective weight is semibold+.
pub(crate) fn resolve_blocks(
    style: &CvStyle,
    blocks: &[StyledBlock],
    cover_letter: bool,
) -> Vec<RenderBlock> {
    blocks
        .iter()
        .map(|b| {
            let eff = if cover_letter {
                effective_cl(style, b.section_key.as_deref())
            } else {
                effective_cv(style, b.section_key.as_deref())
            };
            RenderBlock {
                level: b.level,
                font_family: eff.font_family,
                size_pt: eff.size_pt * b.level.scale(),
                rgb: eff.rgb,
                bold: b.level.is_heading() || b.bold || eff.weight >= 600,
                text: b.text.clone(),
                section_key: b.section_key.clone(),
            }
        })
        .collect()
}

/// Parses already-rendered markdown (the tailored-CV journal path, which has no
/// per-section style) into blocks tagged with no section key — they resolve to
/// the document-wide style. A `**wrapped**` line becomes bold body text.
fn md_to_blocks(content_md: &str) -> Vec<StyledBlock> {
    let mk = |level, text: &str, bold| StyledBlock {
        level,
        section_key: None,
        text: text.to_string(),
        bold,
    };
    content_md
        .lines()
        .filter_map(|line| {
            if let Some(t) = line.strip_prefix("# ") {
                Some(mk(BlockLevel::H1, t, false))
            } else if let Some(t) = line.strip_prefix("## ") {
                Some(mk(BlockLevel::H2, t, false))
            } else if let Some(t) = line.strip_prefix("### ") {
                Some(mk(BlockLevel::H3, t, false))
            } else if let Some(t) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
                Some(mk(BlockLevel::Bullet, t, false))
            } else if line.trim().is_empty() {
                None
            } else {
                let (text, bold) = strip_bold_wrap(line);
                Some(mk(BlockLevel::Body, text, bold))
            }
        })
        .collect()
}

/// Strips a single `**…**` wrap, reporting whether it was bold.
fn strip_bold_wrap(line: &str) -> (&str, bool) {
    let t = line.trim();
    if t.len() >= 4 && t.starts_with("**") && t.ends_with("**") {
        (t[2..t.len() - 2].trim(), true)
    } else {
        (line, false)
    }
}

// ── DOCX rendering ────────────────────────────────────────────────────────────

/// Tailored-CV journal export (markdown in, document-wide default style).
pub(crate) fn md_to_docx_bytes(content_md: &str, photo: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let blocks = md_to_blocks(content_md);
    let resolved = resolve_blocks(&CvStyle::default(), &blocks, false);
    let page = resolve_page(&crate::commands::documents::PageSettings::default());
    // Journal exports have no section tags; a photo (when present) sits at the
    // top of the document — AboveCenter mirrors that top placement.
    render_blocks_docx(
        &resolved,
        photo,
        crate::commands::documents::PhotoPlacement::AboveCenter,
        &page,
    )
}

/// Builds a styled DOCX paragraph from a `RenderBlock`. Single source of the
/// per-block run styling + vertical rhythm, reused by the main body flow, the
/// photo-beside-header table cell, and the below-table blocks so all three stay
/// pixel-identical. docx-rs paragraphs are flush by default, which reads as
/// cramped next to the spaced PDF; the before/after (twips, 1/20 pt) scale to
/// the block size so headings breathe and body/bullets stay tight.
fn block_paragraph(b: &RenderBlock) -> docx_rs::Paragraph {
    use docx_rs::*;

    let (r, g, bl) = b.rgb;
    let text = if b.level == BlockLevel::Bullet {
        format!("•  {}", b.text)
    } else {
        b.text.clone()
    };
    let mut run = Run::new()
        .add_text(&text)
        .size((b.size_pt * 2.0).round() as usize) // docx size is half-points
        .color(format!("{r:02X}{g:02X}{bl:02X}"))
        .fonts(
            RunFonts::new()
                .ascii(&b.font_family)
                .hi_ansi(&b.font_family),
        );
    if b.bold {
        run = run.bold();
    }
    let (before, after) = match b.level {
        BlockLevel::H1 | BlockLevel::H2 | BlockLevel::H3 => (
            (b.size_pt * 9.0).round() as u32,
            (b.size_pt * 3.0).round() as u32,
        ),
        BlockLevel::Bullet => (0, (b.size_pt * 2.0).round() as u32),
        BlockLevel::Body => (0, (b.size_pt * 3.5).round() as u32),
    };
    let mut para = Paragraph::new()
        .add_run(run)
        .line_spacing(LineSpacing::new().before(before).after(after));
    if b.level == BlockLevel::Bullet {
        para = para.indent(Some(360), None, None, None);
    }
    para
}

/// Serialises a built `Docx` to the in-memory .docx byte stream.
fn finish_docx(doc: docx_rs::Docx) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    doc.build()
        .pack(std::io::Cursor::new(&mut buf))
        .map_err(|e| format!("docx pack: {e}"))?;
    Ok(buf)
}

/// `pub(crate)`, not private: the library CV/cover-letter export in
/// `commands::documents` builds section-tagged blocks and calls this directly.
///
/// `placement` controls the CV photo: `AboveCenter` centres the photo in its
/// own paragraph with all content below; `AboveLeft`/`AboveRight` place the
/// photo in a borderless 2-cell table beside the leading `personal_details`
/// blocks (cell order sets the side), with the remaining blocks below.
pub(crate) fn render_blocks_docx(
    blocks: &[RenderBlock],
    photo: Option<&[u8]>,
    placement: crate::commands::documents::PhotoPlacement,
    page: &PageConfig,
) -> Result<Vec<u8>, String> {
    use crate::commands::documents::PhotoPlacement;
    use docx_rs::*;

    // Page size + margins. docx-rs takes twips (1 mm ≈ 56.6929 twips / DXA).
    let tw = |mm: f32| (mm * 56.6929) as i32;
    let mut doc = Docx::new()
        .page_size(tw(page.width_mm) as u32, tw(page.height_mm) as u32)
        .page_margin(
            PageMargin::new()
                .top(tw(page.margin.top))
                .bottom(tw(page.margin.bottom))
                .left(tw(page.margin.left))
                .right(tw(page.margin.right)),
        );

    // docx-rs 0.4: `Pic::new(&[u8])` decodes/re-encodes and computes pixel
    // size; we override the box to ~2.7cm x 3.6cm (3:4) in EMU (914400 EMU/inch).
    let pic = photo.map(|bytes| Pic::new(bytes).size(972_000, 1_296_000));
    let is_personal = |b: &RenderBlock| b.section_key.as_deref() == Some("personal_details");

    match (pic, placement) {
        (Some(pic), PhotoPlacement::AboveLeft) | (Some(pic), PhotoPlacement::AboveRight) => {
            // Leading personal_details blocks share a row with the photo; the
            // rest of the CV flows below the table.
            let split = blocks
                .iter()
                .position(|b| !is_personal(b))
                .unwrap_or(blocks.len());
            let (head, rest) = blocks.split_at(split);

            let photo_cell = TableCell::new()
                .clear_all_border()
                .add_paragraph(Paragraph::new().add_run(Run::new().add_image(pic)));
            let mut text_cell = TableCell::new().clear_all_border();
            if head.is_empty() {
                text_cell = text_cell.add_paragraph(Paragraph::new());
            } else {
                for b in head {
                    text_cell = text_cell.add_paragraph(block_paragraph(b));
                }
            }

            let cells = if placement == PhotoPlacement::AboveLeft {
                vec![photo_cell, text_cell]
            } else {
                vec![text_cell, photo_cell]
            };
            let table =
                Table::new(vec![TableRow::new(cells)]).set_borders(TableBorders::new().clear_all());
            doc = doc.add_table(table);
            for b in rest {
                doc = doc.add_paragraph(block_paragraph(b));
            }
        }
        (Some(pic), PhotoPlacement::AboveCenter) => {
            doc = doc.add_paragraph(
                Paragraph::new()
                    .align(AlignmentType::Center)
                    .add_run(Run::new().add_image(pic)),
            );
            for b in blocks {
                doc = doc.add_paragraph(block_paragraph(b));
            }
        }
        (None, _) => {
            for b in blocks {
                doc = doc.add_paragraph(block_paragraph(b));
            }
        }
    }

    finish_docx(doc)
}

#[tauri::command]
pub async fn export_docx(
    job_id: i64,
    content_md: String,
    company: String,
    job_title: String,
    input_hash: String,
    app: AppHandle,
    db: State<'_, Db>,
) -> Result<GeneratedDoc, String> {
    if let Some(doc) = fetch_generated_doc(job_id, &input_hash, "docx", &db).await? {
        if std::path::Path::new(&doc.file_path).exists() {
            return Ok(doc);
        }
    }

    let bytes = md_to_docx_bytes(&content_md, None)?;
    let dir = cv_dir(&app, &company, &job_title)?;
    let path = dir.join(cv_filename(&job_title, &company, &input_hash, "docx"));
    std::fs::write(&path, &bytes).map_err(|e| format!("write docx: {e}"))?;

    upsert_generated_doc(
        job_id,
        &input_hash,
        "docx",
        path.to_str().unwrap_or(""),
        &db,
    )
    .await
}

// ── PDF rendering ─────────────────────────────────────────────────────────────

/// Tailored-CV journal export (markdown in, document-wide default style).
pub(crate) fn md_to_pdf_bytes(content_md: &str, photo: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let blocks = md_to_blocks(content_md);
    let resolved = resolve_blocks(&CvStyle::default(), &blocks, false);
    let page = resolve_page(&crate::commands::documents::PageSettings::default());
    render_blocks_pdf(
        &resolved,
        photo,
        crate::commands::documents::PhotoPlacement::default(),
        &page,
    )
}

/// Maps a user font family + weight to the nearest PDF base font. printpdf only
/// ships the 14 base fonts, so exact custom fonts (Calibri, Lato) can't render
/// in PDF without embedding TTFs — a deliberate follow-up. DOCX keeps the real
/// font name, so only PDF approximates.
fn pick_pdf_font<'a>(
    family: &str,
    bold: bool,
    helv: &'a printpdf::IndirectFontRef,
    helv_b: &'a printpdf::IndirectFontRef,
    times: &'a printpdf::IndirectFontRef,
    times_b: &'a printpdf::IndirectFontRef,
    courier: &'a printpdf::IndirectFontRef,
    courier_b: &'a printpdf::IndirectFontRef,
) -> &'a printpdf::IndirectFontRef {
    let f = family.to_lowercase();
    let mono = ["courier", "mono", "consolas"]
        .iter()
        .any(|s| f.contains(s));
    let serif = [
        "times",
        "georgia",
        "garamond",
        "serif",
        "cambria",
        "book antiqua",
    ]
    .iter()
    .any(|s| f.contains(s));
    if mono {
        if bold {
            courier_b
        } else {
            courier
        }
    } else if serif {
        if bold {
            times_b
        } else {
            times
        }
    } else if bold {
        helv_b
    } else {
        helv
    }
}

/// Average glyph-advance as a fraction of point size, used to estimate text
/// width for wrapping. printpdf's base fonts expose no metrics, so this is a
/// deliberately conservative heuristic (slightly over-estimating width keeps
/// wide-glyph lines inside the margin rather than clipping).
fn char_ratio(family: &str) -> f32 {
    let f = family.to_lowercase();
    if ["courier", "mono", "consolas"]
        .iter()
        .any(|s| f.contains(s))
    {
        0.62 // monospace advances are wider
    } else {
        0.53
    }
}

/// Greedy word-wrap to a max character count. A word longer than the limit
/// (e.g. a long URL) is hard-split so it can never overflow the page width.
fn wrap_text(text: &str, max_chars: usize) -> Vec<String> {
    if max_chars == 0 {
        return vec![text.to_string()];
    }
    let mut lines: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut cur_len = 0usize;
    for word in text.split_whitespace() {
        let wlen = word.chars().count();
        if wlen > max_chars {
            if !cur.is_empty() {
                lines.push(std::mem::take(&mut cur));
            }
            let mut rest = word;
            while rest.chars().count() > max_chars {
                let idx = rest
                    .char_indices()
                    .nth(max_chars)
                    .map(|(i, _)| i)
                    .unwrap_or(rest.len());
                lines.push(rest[..idx].to_string());
                rest = &rest[idx..];
            }
            cur = rest.to_string();
            cur_len = cur.chars().count();
            continue;
        }
        let projected = if cur.is_empty() {
            wlen
        } else {
            cur_len + 1 + wlen
        };
        if projected > max_chars {
            lines.push(std::mem::take(&mut cur));
            cur = word.to_string();
            cur_len = wlen;
        } else {
            if !cur.is_empty() {
                cur.push(' ');
                cur_len += 1;
            }
            cur.push_str(word);
            cur_len += wlen;
        }
    }
    if !cur.is_empty() {
        lines.push(cur);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

/// `pub(crate)`: the library CV/cover-letter export in `commands::documents`
/// builds section-tagged blocks and calls this directly.
pub(crate) fn render_blocks_pdf(
    blocks: &[RenderBlock],
    photo: Option<&[u8]>,
    placement: crate::commands::documents::PhotoPlacement,
    page: &PageConfig,
) -> Result<Vec<u8>, String> {
    use crate::commands::documents::PhotoPlacement;
    use printpdf::*;

    let (doc, page1, layer1) =
        PdfDocument::new("CV", Mm(page.width_mm), Mm(page.height_mm), "Layer 1");

    let helv = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| format!("pdf font: {e}"))?;
    let helv_b = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| format!("pdf font: {e}"))?;
    let times = doc
        .add_builtin_font(BuiltinFont::TimesRoman)
        .map_err(|e| format!("pdf font: {e}"))?;
    let times_b = doc
        .add_builtin_font(BuiltinFont::TimesBold)
        .map_err(|e| format!("pdf font: {e}"))?;
    let courier = doc
        .add_builtin_font(BuiltinFont::Courier)
        .map_err(|e| format!("pdf font: {e}"))?;
    let courier_b = doc
        .add_builtin_font(BuiltinFont::CourierBold)
        .map_err(|e| format!("pdf font: {e}"))?;

    // PDF geometry uses a single margin value; the per-side model has richer
    // data (top/right/bottom/left) but this legacy `printpdf` path predates it
    // and is retired from the CV/cover-letter flow in a later phase, so we
    // keep it simple and use `margin.top` uniformly rather than threading all
    // four sides through the pdf layout math.
    let margin = Mm(page.margin.top);
    let margin_mm = page.margin.top;
    let indent_mm = page.margin.top + 5.0;
    let right_margin_mm = page.margin.top;
    let page_w_mm = page.width_mm;
    let top_y = page.height_mm - page.margin.top;
    let mut y: f32 = top_y;
    let mut cur_page = page1;
    let mut cur_layer = layer1;

    if let Some(bytes) = photo {
        // printpdf 0.7 (`embedded_images`): decode with the crate's re-exported
        // `image` (0.24) so the `DynamicImage` type matches. Force the same
        // ~2.7cm x 3.6cm box as DOCX (independent x/y scale) and place it
        // top-left; text then starts below it — mirroring the DOCX inline-top
        // placement instead of the old top-right overlay that clipped headings.
        let dynimg = printpdf::image_crate::load_from_memory(bytes)
            .map_err(|e| format!("pdf photo decode: {e}"))?;
        let (px_w, px_h) = (dynimg.width() as f32, dynimg.height() as f32);
        let img = Image::from_dynamic_image(&dynimg);
        let dpi = 300.0_f32;
        let nat_w_mm = px_w / dpi * 25.4;
        let nat_h_mm = px_h / dpi * 25.4;
        let (box_w, box_h) = (27.0_f32, 36.0_f32);
        // Photo x-origin. `AboveCenter` horizontally centers the photo within
        // the usable width (same uniform `margin.top` used for left/right in
        // this legacy printpdf path). `AboveLeft`/`AboveRight` approximate as
        // top-of-document here: printpdf left/right float-beside text is
        // intentionally NOT built (plan non-goal: no Rust-PDF table). The
        // detail-view WYSIWYG print PDF is the full-fidelity path for all slots.
        let photo_x = match placement {
            PhotoPlacement::AboveCenter => {
                let usable_w = page_w_mm - margin_mm - right_margin_mm;
                Mm(margin_mm + (usable_w - box_w) / 2.0)
            }
            PhotoPlacement::AboveLeft | PhotoPlacement::AboveRight => margin,
        };
        let layer = doc.get_page(page1).get_layer(layer1);
        img.add_to_layer(
            layer,
            ImageTransform {
                translate_x: Some(photo_x),
                translate_y: Some(Mm(top_y - box_h)),
                scale_x: Some(if nat_w_mm > 0.0 {
                    box_w / nat_w_mm
                } else {
                    1.0
                }),
                scale_y: Some(if nat_h_mm > 0.0 {
                    box_h / nat_h_mm
                } else {
                    1.0
                }),
                dpi: Some(dpi),
                ..Default::default()
            },
        );
        y = top_y - box_h - 8.0;
    }

    for b in blocks {
        let (r, g, bl) = b.rgb;
        let font = pick_pdf_font(
            &b.font_family,
            b.bold,
            &helv,
            &helv_b,
            &times,
            &times_b,
            &courier,
            &courier_b,
        );
        let bullet = b.level == BlockLevel::Bullet;
        let base_x = if bullet { indent_mm } else { margin_mm };

        // Wrap to the printable width — printpdf's `use_text` never wraps, so a
        // long line would run off the right edge and be clipped. Estimate the
        // character budget from the font's average advance (base fonts expose
        // no metrics) and greedily fold words onto new lines.
        let char_w_mm = b.size_pt as f32 * 0.3528 * char_ratio(&b.font_family);
        let avail_mm = page_w_mm - base_x - right_margin_mm;
        let max_chars = if char_w_mm > 0.0 {
            (avail_mm / char_w_mm).floor().max(1.0) as usize
        } else {
            usize::MAX
        };
        let wrapped = wrap_text(&b.text, max_chars);
        // pt → mm (×0.3528) with ~1.35 leading.
        let line_h = b.size_pt as f32 * 0.3528 * 1.35;

        if b.level.is_heading() {
            y -= 3.0_f32;
        }
        for (i, line) in wrapped.iter().enumerate() {
            if y < margin_mm {
                let (p, l) = doc.add_page(Mm(page_w_mm), Mm(page.height_mm), "Layer 1");
                cur_page = p;
                cur_layer = l;
                y = top_y;
            }
            let layer = doc.get_page(cur_page).get_layer(cur_layer);
            layer.set_fill_color(Color::Rgb(Rgb::new(
                r as f32 / 255.0,
                g as f32 / 255.0,
                bl as f32 / 255.0,
                None,
            )));
            // Bullet glyph on the first wrapped line only; continuation lines
            // hang-indent so they align under the text, not the bullet.
            let (draw_x, draw_text) = if bullet {
                if i == 0 {
                    (base_x, format!("•  {line}"))
                } else {
                    (base_x + 4.0, line.clone())
                }
            } else {
                (base_x, line.clone())
            };
            layer.use_text(&draw_text, b.size_pt as f32, Mm(draw_x), Mm(y), font);
            y -= line_h;
        }
        y -= if b.level.is_heading() { 2.5 } else { 1.5 };
    }

    let mut buf = Vec::new();
    doc.save(&mut std::io::BufWriter::new(&mut buf))
        .map_err(|e| format!("pdf save: {e}"))?;
    Ok(buf)
}

#[tauri::command]
pub async fn export_pdf(
    job_id: i64,
    content_md: String,
    company: String,
    job_title: String,
    input_hash: String,
    app: AppHandle,
    db: State<'_, Db>,
) -> Result<GeneratedDoc, String> {
    if let Some(doc) = fetch_generated_doc(job_id, &input_hash, "pdf", &db).await? {
        if std::path::Path::new(&doc.file_path).exists() {
            return Ok(doc);
        }
    }

    let bytes = md_to_pdf_bytes(&content_md, None)?;
    let dir = cv_dir(&app, &company, &job_title)?;
    let path = dir.join(cv_filename(&job_title, &company, &input_hash, "pdf"));
    std::fs::write(&path, &bytes).map_err(|e| format!("write pdf: {e}"))?;

    upsert_generated_doc(job_id, &input_hash, "pdf", path.to_str().unwrap_or(""), &db).await
}

// ── File reveal / open ───────────────────────────────────────────────────────

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path])
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn reveal_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(format!("/select,{path}"))
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&path)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or(&path);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("reveal_in_folder: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::documents::{CvSectionStyle, CvStyle, PhotoPlacement};
    use std::collections::HashMap;

    fn section(
        font: Option<&str>,
        size: Option<f64>,
        color: Option<&str>,
        weight: Option<i64>,
    ) -> CvSectionStyle {
        CvSectionStyle {
            font_family: font.map(str::to_string),
            font_size_pt: size,
            color_hex: color.map(str::to_string),
            font_weight: weight,
        }
    }

    #[test]
    fn hex_to_rgb_parses_and_falls_back() {
        assert_eq!(hex_to_rgb("#FF8000"), (255, 128, 0));
        assert_eq!(hex_to_rgb("00ff00"), (0, 255, 0));
        assert_eq!(hex_to_rgb("bogus"), (51, 51, 51)); // malformed → #333333
        assert_eq!(hex_to_rgb("#12345"), (51, 51, 51)); // wrong length → default
    }

    #[test]
    fn effective_cv_uses_global_without_override() {
        let style = CvStyle::default(); // Calibri 11 #333333 400
        let eff = effective_cv(&style, Some("summary"));
        assert_eq!(eff.font_family, "Calibri");
        assert_eq!(eff.size_pt, 11.0);
        assert_eq!(eff.weight, 400);
        assert_eq!(eff.rgb, (51, 51, 51));
    }

    #[test]
    fn effective_cv_section_override_wins_field_by_field() {
        let mut style = CvStyle::default();
        // Only override size + colour for `experience`; font/weight inherit.
        style.section_styles.insert(
            "experience".into(),
            section(None, Some(13.0), Some("#000000"), None),
        );
        let eff = effective_cv(&style, Some("experience"));
        assert_eq!(eff.font_family, "Calibri"); // inherited
        assert_eq!(eff.size_pt, 13.0); // overridden
        assert_eq!(eff.rgb, (0, 0, 0)); // overridden
        assert_eq!(eff.weight, 400); // inherited
    }

    #[test]
    fn effective_cl_paragraph_cascades_through_body_block() {
        let mut style = CvStyle::default();
        let mut map: HashMap<String, CvSectionStyle> = HashMap::new();
        // body block sets font Georgia + weight 600; paragraph 1 overrides size only.
        map.insert(
            "body".into(),
            section(Some("Georgia"), None, None, Some(600)),
        );
        map.insert("body_1".into(), section(None, Some(12.0), None, None));
        style.section_styles = map;

        let p1 = effective_cl(&style, Some("body_1"));
        assert_eq!(p1.font_family, "Georgia"); // from body block
        assert_eq!(p1.weight, 600); // from body block
        assert_eq!(p1.size_pt, 12.0); // paragraph override
        assert_eq!(p1.rgb, (51, 51, 51)); // global default

        // A paragraph with no own override inherits the body block fully.
        let p0 = effective_cl(&style, Some("body_0"));
        assert_eq!(p0.font_family, "Georgia");
        assert_eq!(p0.size_pt, 11.0); // body block inherits global size
    }

    #[test]
    fn resolve_blocks_scales_headings_and_forces_bold() {
        let style = CvStyle::default();
        let blocks = vec![
            StyledBlock {
                level: BlockLevel::H1,
                section_key: Some("personal_details".into()),
                text: "Jane Doe".into(),
                bold: false,
            },
            StyledBlock {
                level: BlockLevel::Bullet,
                section_key: Some("experience".into()),
                text: "Shipped X".into(),
                bold: false,
            },
        ];
        let resolved = resolve_blocks(&style, &blocks, false);
        // H1: 11 * 1.6 = 17.6, bold forced despite tag=false.
        assert!((resolved[0].size_pt - 17.6).abs() < 1e-9);
        assert!(resolved[0].bold);
        // Bullet: base size, weight 400 → not bold.
        assert_eq!(resolved[1].size_pt, 11.0);
        assert!(!resolved[1].bold);
    }

    #[test]
    fn resolve_blocks_bold_when_weight_is_semibold() {
        let mut style = CvStyle::default();
        style.font_weight = 600;
        let blocks = vec![StyledBlock {
            level: BlockLevel::Body,
            section_key: None,
            text: "hi".into(),
            bold: false,
        }];
        assert!(resolve_blocks(&style, &blocks, false)[0].bold);
    }

    #[test]
    fn md_to_blocks_maps_prefixes_and_strips_bold() {
        let md =
            "# Name\n\n## Summary\n\n**Fully Bold**\n**Lead Dev**, Acme\n- did a thing\nplain line";
        let blocks = md_to_blocks(md);
        assert_eq!(blocks.len(), 6); // blank lines dropped
        assert_eq!(blocks[0].level, BlockLevel::H1);
        assert_eq!(blocks[1].level, BlockLevel::H2);
        // Fully wrapped `**…**` → bold body, wrap stripped.
        assert_eq!(blocks[2].level, BlockLevel::Body);
        assert!(blocks[2].bold);
        assert_eq!(blocks[2].text, "Fully Bold");
        // Partial wrap (does not end in `**`) → left literal, not bold.
        assert!(!blocks[3].bold);
        assert_eq!(blocks[3].text, "**Lead Dev**, Acme");
        assert_eq!(blocks[4].level, BlockLevel::Bullet);
        assert_eq!(blocks[5].level, BlockLevel::Body);
        assert!(!blocks[5].bold);
    }

    #[test]
    fn wrap_text_folds_words_greedily() {
        let lines = wrap_text("one two three four", 8);
        // "one two" = 7 fits; +" three" would be 13 > 8 → break.
        assert_eq!(lines, vec!["one two", "three", "four"]);
        for l in &lines {
            assert!(l.chars().count() <= 8);
        }
    }

    #[test]
    fn wrap_text_hard_splits_overlong_word() {
        let lines = wrap_text("supercalifragilistic", 5);
        assert!(lines.iter().all(|l| l.chars().count() <= 5));
        assert_eq!(lines.concat(), "supercalifragilistic"); // nothing lost
    }

    #[test]
    fn wrap_text_handles_empty_and_zero_budget() {
        assert_eq!(wrap_text("", 10), vec![String::new()]);
        assert_eq!(wrap_text("keep whole", 0), vec!["keep whole"]);
    }

    #[test]
    fn resolve_page_maps_presets_to_mm() {
        use crate::commands::documents::{MarginSpec, PageSettings};
        let a4_normal = resolve_page(&PageSettings {
            size: "a4".into(),
            margin: MarginSpec::Preset("normal".into()),
        });
        assert_eq!(
            (
                a4_normal.width_mm,
                a4_normal.height_mm,
                a4_normal.margin.top
            ),
            (210.0, 297.0, 20.0)
        );

        let letter_narrow = resolve_page(&PageSettings {
            size: "letter".into(),
            margin: MarginSpec::Preset("narrow".into()),
        });
        assert_eq!(letter_narrow.width_mm, 215.9);
        assert_eq!(letter_narrow.height_mm, 279.4);
        assert_eq!(letter_narrow.margin.top, 12.7);

        // Unknown values fall back to A4 / normal.
        let junk = resolve_page(&PageSettings {
            size: "x".into(),
            margin: MarginSpec::Preset("y".into()),
        });
        assert_eq!(
            (junk.width_mm, junk.height_mm, junk.margin.top),
            (210.0, 297.0, 20.0)
        );
    }

    #[test]
    fn resolve_page_maps_legacy_preset_and_four_side_mm() {
        use crate::commands::documents::{MarginSpec, PageMargins, PageSettings};
        // legacy preset
        let legacy = PageSettings {
            size: "a4".into(),
            margin: MarginSpec::Preset("wide".into()),
        };
        let c = resolve_page(&legacy);
        assert_eq!(c.width_mm, 210.0);
        assert_eq!(c.margin.top, 30.0);
        assert_eq!(c.margin.left, 30.0);
        // 4-side object
        let sides = PageSettings {
            size: "letter".into(),
            margin: MarginSpec::Sides(PageMargins {
                top: 10.0,
                right: 15.0,
                bottom: 20.0,
                left: 25.0,
            }),
        };
        let c2 = resolve_page(&sides);
        assert_eq!(c2.width_mm, 215.9);
        assert_eq!(c2.margin.right, 15.0);
        assert_eq!(c2.margin.left, 25.0);
        // clamp
        let bad = PageSettings {
            size: "a4".into(),
            margin: MarginSpec::Sides(PageMargins {
                top: -5.0,
                right: 80.0,
                bottom: 20.0,
                left: 20.0,
            }),
        };
        let c3 = resolve_page(&bad);
        assert_eq!(c3.margin.top, 0.0);
        assert_eq!(c3.margin.right, 50.0);
    }

    #[test]
    fn render_blocks_letter_wide_produce_bytes() {
        let style = crate::commands::documents::CvStyle::default();
        let blocks = resolve_blocks(
            &style,
            &[StyledBlock {
                level: BlockLevel::Body,
                section_key: None,
                text: "hello world".into(),
                bold: false,
            }],
            false,
        );
        let page = resolve_page(&crate::commands::documents::PageSettings {
            size: "letter".into(),
            margin: crate::commands::documents::MarginSpec::Preset("wide".into()),
        });
        assert!(
            !render_blocks_pdf(&blocks, None, PhotoPlacement::AboveLeft, &page)
                .expect("pdf")
                .is_empty()
        );
        assert!(
            !render_blocks_docx(&blocks, None, PhotoPlacement::AboveLeft, &page)
                .expect("docx")
                .is_empty()
        );
    }

    #[test]
    fn docx_photo_center_and_side_placements_render() {
        let style = crate::commands::documents::CvStyle::default();
        let blocks = vec![
            StyledBlock {
                level: BlockLevel::H1,
                section_key: Some("personal_details".into()),
                text: "Jane Doe".into(),
                bold: true,
            },
            StyledBlock {
                level: BlockLevel::Body,
                section_key: Some("personal_details".into()),
                text: "jane@example.com".into(),
                bold: false,
            },
            StyledBlock {
                level: BlockLevel::H2,
                section_key: Some("summary".into()),
                text: "Summary".into(),
                bold: true,
            },
        ];
        let resolved = resolve_blocks(&style, &blocks, false);
        let page = resolve_page(&crate::commands::documents::PageSettings::default());
        let photo: &[u8] = include_bytes!("../../test-assets/1x1.png"); // tiny valid PNG

        // All three placements produce a non-empty valid .docx byte stream.
        for p in [
            PhotoPlacement::AboveLeft,
            PhotoPlacement::AboveCenter,
            PhotoPlacement::AboveRight,
        ] {
            let out = render_blocks_docx(&resolved, Some(photo), p, &page).unwrap();
            assert!(out.len() > 100, "docx bytes empty for {p:?}");
        }
    }

    #[test]
    fn pdf_photo_center_and_side_placements_render() {
        let style = crate::commands::documents::CvStyle::default();
        let blocks = vec![
            StyledBlock {
                level: BlockLevel::H1,
                section_key: Some("personal_details".into()),
                text: "Jane Doe".into(),
                bold: true,
            },
            StyledBlock {
                level: BlockLevel::Body,
                section_key: Some("personal_details".into()),
                text: "jane@example.com".into(),
                bold: false,
            },
            StyledBlock {
                level: BlockLevel::H2,
                section_key: Some("summary".into()),
                text: "Summary".into(),
                bold: true,
            },
        ];
        let resolved = resolve_blocks(&style, &blocks, false);
        let page = resolve_page(&crate::commands::documents::PageSettings::default());
        let photo: &[u8] = include_bytes!("../../test-assets/1x1.png"); // tiny valid PNG

        // Center centers the x-origin; left/right approximate as top-of-document.
        // All three placements must produce non-empty valid PDF bytes.
        for p in [
            PhotoPlacement::AboveLeft,
            PhotoPlacement::AboveCenter,
            PhotoPlacement::AboveRight,
        ] {
            let out = render_blocks_pdf(&resolved, Some(photo), p, &page).unwrap();
            assert!(out.len() > 100, "pdf bytes empty for {p:?}");
        }
    }
}
