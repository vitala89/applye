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

#[derive(Debug, Clone)]
pub(crate) struct InlineRun {
    pub text: String,
    pub bold: bool,
}

/// Splits a line into `**bold**` / plain runs, mirroring the TS
/// `parseInlineEmphasis`. Unmatched `**` stays literal; no spans → one plain
/// run. Never panics on odd markers.
pub(crate) fn parse_inline_runs(s: &str) -> Vec<InlineRun> {
    let bytes = s.as_bytes();
    let mut runs: Vec<InlineRun> = Vec::new();
    let mut i = 0usize;
    let mut plain_start = 0usize;
    while i + 1 < bytes.len() {
        if bytes[i] == b'*' && bytes[i + 1] == b'*' {
            // find closing ** after i+2
            if let Some(rel) = s[i + 2..].find("**") {
                let inner_start = i + 2;
                let inner_end = inner_start + rel;
                if inner_end > inner_start {
                    if i > plain_start {
                        runs.push(InlineRun {
                            text: s[plain_start..i].to_string(),
                            bold: false,
                        });
                    }
                    runs.push(InlineRun {
                        text: s[inner_start..inner_end].to_string(),
                        bold: true,
                    });
                    i = inner_end + 2;
                    plain_start = i;
                    continue;
                }
            }
        }
        i += 1;
    }
    if plain_start < s.len() {
        runs.push(InlineRun {
            text: s[plain_start..].to_string(),
            bold: false,
        });
    }
    if runs.is_empty() {
        runs.push(InlineRun {
            text: s.to_string(),
            bold: false,
        });
    }
    runs
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
    let color = format!("{r:02X}{g:02X}{bl:02X}");
    let mk_run = |seg: &str, bold: bool| {
        let mut run = Run::new()
            .add_text(seg)
            .size((b.size_pt * 2.0).round() as usize) // docx size is half-points
            .color(&color)
            .fonts(
                RunFonts::new()
                    .ascii(&b.font_family)
                    .hi_ansi(&b.font_family),
            );
        if bold {
            run = run.bold();
        }
        run
    };
    let (before, after) = match b.level {
        BlockLevel::H1 | BlockLevel::H2 | BlockLevel::H3 => (
            (b.size_pt * 9.0).round() as u32,
            (b.size_pt * 3.0).round() as u32,
        ),
        BlockLevel::Bullet => (0, (b.size_pt * 2.0).round() as u32),
        BlockLevel::Body => (0, (b.size_pt * 3.5).round() as u32),
    };
    let mut para = Paragraph::new().line_spacing(LineSpacing::new().before(before).after(after));
    if b.level == BlockLevel::Bullet {
        para = para.add_run(mk_run("•  ", b.bold));
    }
    for seg in parse_inline_runs(&b.text) {
        para = para.add_run(mk_run(&seg.text, b.bold || seg.bold));
    }
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

// ── Embedded CV fonts ───────────────────────────────────────────────────────
// Metric-compatible, freely-redistributable clones of the proprietary ATS-safe
// fonts, embedded so the printpdf export renders the user's chosen family
// instead of a base-font approximation. Regular + Bold per family; monospace
// families keep the printpdf builtin Courier (already a real monospace metric).
// See assets/fonts/NOTICE.md for the clone→original mapping and licenses.
const FONT_CARLITO_R: &[u8] = include_bytes!("../../assets/fonts/Carlito-Regular.ttf");
const FONT_CARLITO_B: &[u8] = include_bytes!("../../assets/fonts/Carlito-Bold.ttf");
const FONT_ARIMO_R: &[u8] = include_bytes!("../../assets/fonts/Arimo-Regular.ttf");
const FONT_ARIMO_B: &[u8] = include_bytes!("../../assets/fonts/Arimo-Bold.ttf");
const FONT_TINOS_R: &[u8] = include_bytes!("../../assets/fonts/Tinos-Regular.ttf");
const FONT_TINOS_B: &[u8] = include_bytes!("../../assets/fonts/Tinos-Bold.ttf");
const FONT_GELASIO_R: &[u8] = include_bytes!("../../assets/fonts/Gelasio-Regular.ttf");
const FONT_GELASIO_B: &[u8] = include_bytes!("../../assets/fonts/Gelasio-Bold.ttf");
const FONT_LATO_R: &[u8] = include_bytes!("../../assets/fonts/Lato-Regular.ttf");
const FONT_LATO_B: &[u8] = include_bytes!("../../assets/fonts/Lato-Bold.ttf");
const FONT_OPENSANS_R: &[u8] = include_bytes!("../../assets/fonts/OpenSans-Regular.ttf");
const FONT_OPENSANS_B: &[u8] = include_bytes!("../../assets/fonts/OpenSans-Bold.ttf");

/// Which embedded face renders a given user font family. `Courier` is the odd
/// one out: no bundled clone, it falls back to the printpdf builtin.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
enum PdfFamily {
    Carlito,  // Calibri clone (also the default fallback — matches CvStyle default)
    Arimo,    // Arial / Helvetica clone; also covers Verdana/Tahoma (no closer ATS clone)
    Tinos,    // Times New Roman clone; also covers Garamond/Cambria/generic serif
    Gelasio,  // Georgia clone
    Lato,     // native OFL font
    OpenSans, // native OFL font
    Courier,  // builtin (monospace) — no embedded bytes
}

/// Map a user font-family string to the nearest bundled face. Specific names are
/// matched before the generic `serif`/`sans` fallbacks so e.g. "Georgia" hits
/// Gelasio rather than the serif catch-all.
fn pick_pdf_family(family: &str) -> PdfFamily {
    let f = family.to_lowercase();
    let has = |needles: &[&str]| needles.iter().any(|s| f.contains(s));
    if has(&["courier", "mono", "consolas"]) {
        PdfFamily::Courier
    } else if has(&["calibri", "carlito"]) {
        PdfFamily::Carlito
    } else if has(&["georgia", "gelasio"]) {
        PdfFamily::Gelasio
    } else if has(&["lato"]) {
        PdfFamily::Lato
    } else if has(&["open sans", "opensans"]) {
        PdfFamily::OpenSans
    } else if has(&[
        "times",
        "tinos",
        "garamond",
        "cambria",
        "book antiqua",
        "serif",
    ]) {
        PdfFamily::Tinos
    } else if has(&["arial", "helvetica", "arimo", "verdana", "tahoma", "sans"]) {
        PdfFamily::Arimo
    } else {
        PdfFamily::Carlito
    }
}

/// Raw TTF bytes for an embedded face, or `None` for `Courier` (builtin).
fn pdf_font_bytes(fam: PdfFamily, bold: bool) -> Option<&'static [u8]> {
    Some(match (fam, bold) {
        (PdfFamily::Carlito, false) => FONT_CARLITO_R,
        (PdfFamily::Carlito, true) => FONT_CARLITO_B,
        (PdfFamily::Arimo, false) => FONT_ARIMO_R,
        (PdfFamily::Arimo, true) => FONT_ARIMO_B,
        (PdfFamily::Tinos, false) => FONT_TINOS_R,
        (PdfFamily::Tinos, true) => FONT_TINOS_B,
        (PdfFamily::Gelasio, false) => FONT_GELASIO_R,
        (PdfFamily::Gelasio, true) => FONT_GELASIO_B,
        (PdfFamily::Lato, false) => FONT_LATO_R,
        (PdfFamily::Lato, true) => FONT_LATO_B,
        (PdfFamily::OpenSans, false) => FONT_OPENSANS_R,
        (PdfFamily::OpenSans, true) => FONT_OPENSANS_B,
        (PdfFamily::Courier, _) => return None,
    })
}

/// Every proportional (family, bold) pair we bundle. Production loads only the
/// faces a document actually uses; this full list backs the coverage test.
#[cfg(test)]
const EMBEDDED_FACES: &[(PdfFamily, bool)] = &[
    (PdfFamily::Carlito, false),
    (PdfFamily::Carlito, true),
    (PdfFamily::Arimo, false),
    (PdfFamily::Arimo, true),
    (PdfFamily::Tinos, false),
    (PdfFamily::Tinos, true),
    (PdfFamily::Gelasio, false),
    (PdfFamily::Gelasio, true),
    (PdfFamily::Lato, false),
    (PdfFamily::Lato, true),
    (PdfFamily::OpenSans, false),
    (PdfFamily::OpenSans, true),
];

/// Rendered width of `text` at `size_pt`, in points, from the real glyph
/// advances of `face`. Missing glyphs contribute zero — a negligible
/// under-estimate for the odd unsupported character.
fn text_width_pt(text: &str, size_pt: f32, face: &ttf_parser::Face) -> f32 {
    let upem = face.units_per_em() as f32;
    if upem <= 0.0 {
        return 0.0;
    }
    text.chars()
        .map(|ch| {
            face.glyph_index(ch)
                .and_then(|g| face.glyph_hor_advance(g))
                .unwrap_or(0) as f32
                / upem
                * size_pt
        })
        .sum()
}

/// Greedy word-wrap to a printable width (mm), measuring each candidate line
/// against real font metrics (`face`) or, for the builtin Courier, a fixed
/// monospace advance of 0.6·em. A single word wider than the line is hard-split
/// by character so it can never overflow the page.
fn wrap_measured(
    text: &str,
    size_pt: f32,
    avail_mm: f32,
    face: Option<&ttf_parser::Face>,
) -> Vec<String> {
    const PT_TO_MM: f32 = 0.352_777_8;
    let width_mm = |s: &str| -> f32 {
        match face {
            Some(f) => text_width_pt(s, size_pt, f) * PT_TO_MM,
            None => s.chars().count() as f32 * 0.6 * size_pt * PT_TO_MM,
        }
    };
    let mut lines: Vec<String> = Vec::new();
    let mut cur = String::new();
    for word in text.split_whitespace() {
        // Hard-split a word that cannot fit on its own line.
        if width_mm(word) > avail_mm && avail_mm > 0.0 {
            if !cur.is_empty() {
                lines.push(std::mem::take(&mut cur));
            }
            let mut piece = String::new();
            for ch in word.chars() {
                let mut cand = piece.clone();
                cand.push(ch);
                if width_mm(&cand) > avail_mm && !piece.is_empty() {
                    lines.push(std::mem::take(&mut piece));
                    piece.push(ch);
                } else {
                    piece = cand;
                }
            }
            cur = piece;
            continue;
        }
        let cand = if cur.is_empty() {
            word.to_string()
        } else {
            format!("{cur} {word}")
        };
        if cur.is_empty() || width_mm(&cand) <= avail_mm {
            cur = cand;
        } else {
            lines.push(std::mem::take(&mut cur));
            cur = word.to_string();
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

    // Monospace families keep the printpdf builtin Courier; everything else
    // uses an embedded metric-clone loaded once here. `refs` feeds `use_text`;
    // `faces` gives real glyph advances for line-wrapping.
    let courier = doc
        .add_builtin_font(BuiltinFont::Courier)
        .map_err(|e| format!("pdf font: {e}"))?;
    let courier_b = doc
        .add_builtin_font(BuiltinFont::CourierBold)
        .map_err(|e| format!("pdf font: {e}"))?;
    // printpdf embeds every font added to the document, with no subsetting, so
    // only load the (family, weight) pairs the blocks actually use — otherwise
    // every PDF would carry all ~5 MB of bundled faces.
    let mut needed: std::collections::HashSet<(PdfFamily, bool)> = std::collections::HashSet::new();
    for b in blocks {
        let fam = pick_pdf_family(&b.font_family);
        if fam != PdfFamily::Courier {
            needed.insert((fam, b.bold));
        }
    }
    let mut refs: std::collections::HashMap<(PdfFamily, bool), printpdf::IndirectFontRef> =
        std::collections::HashMap::new();
    let mut faces: std::collections::HashMap<(PdfFamily, bool), ttf_parser::Face<'static>> =
        std::collections::HashMap::new();
    for (fam, bold) in needed {
        let bytes = pdf_font_bytes(fam, bold).expect("embedded face has bytes");
        let font_ref = doc
            .add_external_font(std::io::Cursor::new(bytes))
            .map_err(|e| format!("pdf font: {e}"))?;
        let face = ttf_parser::Face::parse(bytes, 0).map_err(|e| format!("pdf font parse: {e}"))?;
        refs.insert((fam, bold), font_ref);
        faces.insert((fam, bold), face);
    }

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
        let fam = pick_pdf_family(&b.font_family);
        let (font, face) = match fam {
            PdfFamily::Courier => (if b.bold { &courier_b } else { &courier }, None),
            _ => (
                refs.get(&(fam, b.bold)).expect("embedded ref loaded"),
                Some(faces.get(&(fam, b.bold)).expect("embedded face loaded")),
            ),
        };
        let bullet = b.level == BlockLevel::Bullet;
        let base_x = if bullet { indent_mm } else { margin_mm };

        // Wrap to the printable width — printpdf's `use_text` never wraps, so a
        // long line would run off the right edge and be clipped. Measure each
        // candidate line against the embedded font's real glyph advances.
        let avail_mm = page_w_mm - base_x - right_margin_mm;
        let wrapped = wrap_measured(&b.text, b.size_pt as f32, avail_mm, face);
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
    fn parse_inline_runs_plain_and_spans() {
        assert_eq!(parse_inline_runs("plain").len(), 1);
        let r = parse_inline_runs("a **b** c");
        assert_eq!(r.len(), 3);
        assert_eq!((r[1].text.as_str(), r[1].bold), ("b", true));
        assert_eq!((r[0].text.as_str(), r[0].bold), ("a ", false));
    }

    #[test]
    fn parse_inline_runs_multiple_and_unmatched() {
        let r = parse_inline_runs("**x** y **z**");
        assert_eq!(r.iter().filter(|s| s.bold).count(), 2);
        // unmatched trailing ** stays literal, not a panic
        let u = parse_inline_runs("a **b");
        assert_eq!(u.iter().any(|s| s.bold), false);
    }

    #[test]
    fn block_paragraph_bold_merge_rule_on_inline_runs() {
        // block_paragraph returns an opaque docx_rs::Paragraph, so this
        // documents the exact `block.bold || run.bold` merge rule it applies
        // per-run via parse_inline_runs, using the same "a **b** c" body line.
        let runs = parse_inline_runs("a **b** c");
        assert_eq!(runs.len(), 3);

        // block.bold = false → bold only on the middle inline-emphasis run.
        let block_bold = false;
        let merged: Vec<bool> = runs.iter().map(|r| block_bold || r.bold).collect();
        assert_eq!(merged, vec![false, true, false]);

        // block.bold = true → every run renders bold, regardless of markers.
        let block_bold = true;
        let merged: Vec<bool> = runs.iter().map(|r| block_bold || r.bold).collect();
        assert_eq!(merged, vec![true, true, true]);
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
        let style = CvStyle {
            font_weight: 600,
            ..CvStyle::default()
        };
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
    fn pick_pdf_family_maps_known_families() {
        assert_eq!(pick_pdf_family("Calibri"), PdfFamily::Carlito);
        assert_eq!(pick_pdf_family("Arial"), PdfFamily::Arimo);
        assert_eq!(pick_pdf_family("Helvetica Neue"), PdfFamily::Arimo);
        assert_eq!(pick_pdf_family("Times New Roman"), PdfFamily::Tinos);
        assert_eq!(pick_pdf_family("Garamond"), PdfFamily::Tinos);
        assert_eq!(pick_pdf_family("Georgia"), PdfFamily::Gelasio);
        assert_eq!(pick_pdf_family("Lato"), PdfFamily::Lato);
        assert_eq!(pick_pdf_family("Open Sans"), PdfFamily::OpenSans);
        assert_eq!(pick_pdf_family("Consolas"), PdfFamily::Courier);
        // Unknown family falls back to the Calibri clone (CvStyle default).
        assert_eq!(pick_pdf_family("Wingdings"), PdfFamily::Carlito);
    }

    #[test]
    fn every_embedded_face_parses_and_has_bytes() {
        for &(fam, bold) in EMBEDDED_FACES {
            let bytes = pdf_font_bytes(fam, bold).expect("bytes present");
            let face = ttf_parser::Face::parse(bytes, 0).expect("valid ttf");
            assert!(face.units_per_em() > 0);
        }
        assert!(pdf_font_bytes(PdfFamily::Courier, false).is_none());
    }

    #[test]
    fn text_width_pt_scales_linearly_with_size() {
        let face = ttf_parser::Face::parse(FONT_CARLITO_R, 0).unwrap();
        let w10 = text_width_pt("Experience", 10.0, &face);
        let w20 = text_width_pt("Experience", 20.0, &face);
        assert!(w10 > 0.0);
        assert!((w20 - 2.0 * w10).abs() < 0.01);
    }

    #[test]
    fn wrap_measured_keeps_lines_within_width() {
        let face = ttf_parser::Face::parse(FONT_CARLITO_R, 0).unwrap();
        let avail = 40.0_f32;
        let lines = wrap_measured(
            "Led a cross functional team delivering privacy first features",
            11.0,
            avail,
            Some(&face),
        );
        assert!(lines.len() > 1, "long text should wrap");
        for l in &lines {
            assert!(
                text_width_pt(l, 11.0, &face) * 0.352_777_8 <= avail + 0.01,
                "line over width: {l:?}"
            );
        }
    }

    #[test]
    fn wrap_measured_hard_splits_overlong_word_without_loss() {
        let face = ttf_parser::Face::parse(FONT_CARLITO_R, 0).unwrap();
        let word = "supercalifragilisticexpialidocious";
        let lines = wrap_measured(word, 11.0, 12.0, Some(&face));
        assert_eq!(lines.concat(), word, "no characters lost");
    }

    #[test]
    fn wrap_measured_handles_empty_and_courier_fallback() {
        let face = ttf_parser::Face::parse(FONT_CARLITO_R, 0).unwrap();
        assert_eq!(
            wrap_measured("", 11.0, 40.0, Some(&face)),
            vec![String::new()]
        );
        // No face (Courier builtin path) still wraps via the monospace estimate.
        let mono = wrap_measured("alpha beta gamma delta", 11.0, 20.0, None);
        assert!(mono.len() > 1);
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
    fn pdf_embeds_font_for_proprietary_family() {
        // A "Calibri" CV renders through the embedded Carlito clone, so the PDF
        // carries an embedded TTF and is far larger than the same text drawn
        // with a builtin (non-embedded) monospace font. printpdf compresses
        // object streams, so we assert on the embedded-font footprint rather
        // than grepping for the font name.
        let render = |family: &str| {
            let style = crate::commands::documents::CvStyle {
                font_family: family.into(),
                ..crate::commands::documents::CvStyle::default()
            };
            let blocks = resolve_blocks(
                &style,
                &[StyledBlock {
                    level: BlockLevel::Body,
                    section_key: None,
                    text: "Experienced engineer".into(),
                    bold: false,
                }],
                false,
            );
            let page = resolve_page(&crate::commands::documents::PageSettings::default());
            render_blocks_pdf(&blocks, None, PhotoPlacement::AboveCenter, &page).expect("pdf")
        };
        let embedded = render("Calibri"); // → Carlito, embedded TTF
        let builtin = render("Courier New"); // → builtin Courier, no embed
        assert!(
            embedded.len() > builtin.len() + 50_000,
            "embedded-font PDF ({} B) should dwarf the builtin one ({} B)",
            embedded.len(),
            builtin.len()
        );
        // Regression guard: only the used face is embedded, not all ~5 MB of
        // bundled fonts. One regular face (Carlito ≈ 0.6 MB) stays well under 2 MB.
        assert!(
            embedded.len() < 2_000_000,
            "PDF embeds only the used face, not the whole bundle ({} B)",
            embedded.len()
        );
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
