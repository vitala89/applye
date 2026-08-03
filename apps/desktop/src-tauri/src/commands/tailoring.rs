// CV tailoring - cache CRUD for 3-pass results + DOCX/PDF export.
// Cache key: input_hash covers all inputs for a given pass (including upstream
// pass results), so a different pass-1 output invalidates the pass-2 cache.
// Export: DOCX via docx-rs (ATS-reliable); PDF via printpdf 0.7 (pure Rust).
// Files land in <app_data>/companies/<company>/cv/<hash12>.<ext>.

use super::tailoring_fonts::{FONT_LATO_B, FONT_LATO_R, FONT_OPENSANS_B, FONT_OPENSANS_R};
pub(crate) use super::tailoring_pdf::{md_to_pdf_bytes, render_blocks_pdf};
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

use crate::commands::documents_style::CvStyle;

/// Logical role of a block - drives relative size scale and spacing so both
/// renderers agree on hierarchy without hardcoding absolute sizes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BlockLevel {
    H1,
    H2,
    H3,
    Body,
    Bullet,
    /// An experience/education entry's lead line (company / institution). Body
    /// size, bold, and coloured with the theme's entry accent - the CV export
    /// mirror of the preview's accented entry heading.
    EntryHead,
    /// An entry's role/degree line - body size, non-accent, italic when the
    /// theme asks for it. Rendered right under its `EntryHead`.
    EntryRole,
}

impl BlockLevel {
    /// Multiplier applied to the section's effective point size.
    fn scale(self) -> f64 {
        match self {
            BlockLevel::H1 => 1.6,
            BlockLevel::H2 => 1.3,
            BlockLevel::H3 => 1.15,
            BlockLevel::Body
            | BlockLevel::Bullet
            | BlockLevel::EntryHead
            | BlockLevel::EntryRole => 1.0,
        }
    }
    pub(crate) fn is_heading(self) -> bool {
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

/// A horizontal divider drawn under a block - the export mirror of the
/// preview's section/header underline rules. `pt` is the stroke weight in
/// points; `rgb` its colour.
#[derive(Debug, Clone, Copy)]
pub(crate) struct RuleSpec {
    pub pt: f64,
    pub rgb: (u8, u8, u8),
}

/// A block with its style fully resolved - renderers consume this and stay
/// agnostic of the CV-vs-cover-letter cascade rules.
pub(crate) struct RenderBlock {
    pub level: BlockLevel,
    pub font_family: String,
    pub size_pt: f64,
    pub rgb: (u8, u8, u8),
    pub bold: bool,
    /// Italic run - DOCX honours it directly; the PDF path has no bundled
    /// italic faces, so it renders upright (an honest font-availability limit,
    /// same class as the family→clone mapping).
    pub italic: bool,
    pub text: String,
    /// Right-aligned tail of a two-column line (the editor's entry
    /// location/dates column). Regular weight, `right_rgb` colour: the PDF
    /// measures and right-aligns it; DOCX places it after a right tab stop.
    pub right_text: Option<String>,
    /// Colour for `right_text` - body colour, never the accent.
    pub right_rgb: (u8, u8, u8),
    /// Divider drawn under this block, if any - section titles and the header
    /// carry the theme's rule; everything else is `None`.
    pub rule_below: Option<RuleSpec>,
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
        return (51, 51, 51); // #333333 default - matches CV_STYLE_DEFAULT
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
    pub margin: crate::commands::documents_style::PageMargins,
}

fn clamp_mm(v: f32) -> f32 {
    v.clamp(0.0, 50.0)
}

/// Mirrors the TS `resolvePageSettings`. Accepts legacy presets and 4-side mm;
/// unknown size falls back to A4 so a malformed `style_json` never breaks export.
pub(crate) fn resolve_page(p: &crate::commands::documents_style::PageSettings) -> PageConfig {
    use crate::commands::documents_style::{MarginSpec, PageMargins};
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

/// Minimal Rust mirror of the TS `CvThemeDescriptor` (`cv-theme.model.ts`),
/// carrying only what the DOCX/PDF export needs to render like the preview:
/// which text is accent-coloured, which titles uppercase, whether roles are
/// italic, and the header/section divider rules. Keyed by `theme_id` (built-in
/// 1=Classic, 2=Aurora); an unknown/absent id resolves to Classic, matching
/// `getBuiltinTheme`. Kept a hand-maintained mirror on purpose - same
/// cross-language duplication pattern as `CvStyle` - with a parity test.
pub(crate) struct CvTheme {
    pub accent_rgb: (u8, u8, u8),
    pub font_family: String,
    pub base_size_pt: f64,
    pub font_weight: i64,
    /// header.titleColor == "accent"
    pub header_title_accent: bool,
    pub header_rule: Option<RuleSpec>,
    /// sectionHeader.case == "upper"
    pub section_upper: bool,
    /// sectionHeader.color == "accent"
    pub section_title_accent: bool,
    pub section_rule: Option<RuleSpec>,
    /// entry.companyColor == "accent"
    pub entry_company_accent: bool,
    pub entry_role_italic: bool,
    /// Thin rule under each entry's role line (Aurora: 0.4pt muted). `None` when
    /// the theme has no entry rule (Classic).
    pub entry_rule: Option<RuleSpec>,
}

impl CvTheme {
    /// Body-text colour when nothing overrides it - the safe dark grey shared
    /// with `CV_STYLE_DEFAULT` / `hex_to_rgb`'s fallback.
    const TEXT_RGB: (u8, u8, u8) = (51, 51, 51);
}

/// Resolves a divider `RuleSpec` from a theme's `(weightPt, colorRole)` pair,
/// mirroring `themeCssVars`' `ruleWidth`/`colorVar`: a `none` colour or a
/// zero/absent weight means no rule.
fn rule_spec(weight_pt: f64, color: Option<(u8, u8, u8)>) -> Option<RuleSpec> {
    match color {
        Some(rgb) if weight_pt > 0.0 => Some(RuleSpec { pt: weight_pt, rgb }),
        _ => None,
    }
}

/// Built-in theme by id - mirror of `CV_THEME_CLASSIC` / `CV_THEME_AURORA`.
pub(crate) fn builtin_theme(theme_id: Option<i64>) -> CvTheme {
    let classic_accent = (0x33, 0x33, 0x33);
    match theme_id {
        Some(2) => {
            let accent = (0x1B, 0x74, 0x64);
            let muted = (0x66, 0x66, 0x66);
            CvTheme {
                accent_rgb: accent,
                font_family: "Lato".into(),
                base_size_pt: 10.0,
                font_weight: 400,
                header_title_accent: true,
                header_rule: rule_spec(0.8, Some(accent)),
                section_upper: true,
                section_title_accent: true,
                section_rule: rule_spec(0.8, Some(accent)),
                entry_company_accent: true,
                entry_role_italic: true,
                entry_rule: rule_spec(0.4, Some(muted)),
            }
        }
        // Classic (id 1) and any unknown id.
        _ => CvTheme {
            accent_rgb: classic_accent,
            font_family: "Calibri".into(),
            base_size_pt: 11.0,
            font_weight: 400,
            header_title_accent: false,
            header_rule: rule_spec(0.0, None),
            section_upper: true,
            section_title_accent: false,
            section_rule: rule_spec(0.0, None),
            entry_company_accent: false,
            entry_role_italic: false,
            entry_rule: None,
        },
    }
}

/// CV export resolution - the theme-and-role-aware cascade that makes the
/// DOCX/PDF match the live preview. Font/size/weight still come from
/// `effective_cv` (per-section override ?? document-wide). Colour, italics, the
/// uppercase section case, and the divider rules come from `theme`, mirroring
/// the preview's `bodyCss` (body never inherits the accent) + `themeCssVars`.
///
/// Colour rules, by block role:
/// - `H1` (name): theme header title colour (accent or dark).
/// - `H2`/`H3` (section title): theme section title colour.
/// - `EntryHead` (company/institution): theme entry-company colour.
/// - `Body`/`Bullet`/`EntryRole`: per-section colour ?? document body colour ??
///   dark - the no-accent-leak rule, so body text is never green.
///
/// The header rule attaches to the last leading `personal_details` block (under
/// the contact line, as in the preview), not to the name.
pub(crate) fn resolve_cv_blocks(
    style: &CvStyle,
    theme: &CvTheme,
    blocks: &[StyledBlock],
) -> Vec<RenderBlock> {
    let body_rgb = style
        .body_color_hex
        .as_deref()
        .map(hex_to_rgb)
        .unwrap_or(CvTheme::TEXT_RGB);

    let mut out: Vec<RenderBlock> = blocks
        .iter()
        .map(|b| {
            let eff = effective_cv(style, b.section_key.as_deref());
            // Explicit per-section body colour override (preview `bodyCss`:
            // `sectionStyles[key].colorHex ?? bodyColorHex`).
            let section_color = b
                .section_key
                .as_deref()
                .and_then(|k| style.section_styles.get(k))
                .and_then(|s| s.color_hex.as_deref())
                .map(hex_to_rgb);

            // Title/name/entry accent text follows the effective accent
            // (`style.accentColorHex`, seeded from the theme, user-overridable) -
            // mirrors `effectiveTitleStyle`. Divider rules instead use the theme
            // token (`theme.section_rule`/`header_rule`), mirroring `--cv-accent`.
            let accent = hex_to_rgb(&style.accent_color_hex);
            let rgb = match b.level {
                BlockLevel::H1 => {
                    if theme.header_title_accent {
                        accent
                    } else {
                        CvTheme::TEXT_RGB
                    }
                }
                BlockLevel::H2 | BlockLevel::H3 => {
                    if theme.section_title_accent {
                        accent
                    } else {
                        CvTheme::TEXT_RGB
                    }
                }
                BlockLevel::EntryHead => {
                    if theme.entry_company_accent {
                        accent
                    } else {
                        CvTheme::TEXT_RGB
                    }
                }
                BlockLevel::Body | BlockLevel::Bullet | BlockLevel::EntryRole => {
                    section_color.unwrap_or(body_rgb)
                }
            };

            let uppercase =
                theme.section_upper && matches!(b.level, BlockLevel::H2 | BlockLevel::H3);
            let text = if uppercase {
                b.text.to_uppercase()
            } else {
                b.text.clone()
            };
            // Two-column entry lines: `\t` splits the left text from the
            // right-aligned tail (location/dates), which renders regular-weight
            // in the body colour - mirroring the editor's entry rows.
            let (text, right_text) = match text.split_once('\t') {
                Some((l, r)) => (l.to_string(), Some(r.to_string())),
                None => (text, None),
            };

            let rule_below = match b.level {
                BlockLevel::H2 | BlockLevel::H3 => theme.section_rule,
                // Thin rule under each entry's role line, as in the editor.
                BlockLevel::EntryRole => theme.entry_rule,
                _ => None,
            };

            // CV heading sizes mirror the editor's CSS, NOT the generic
            // `BlockLevel::scale()` (which the journal/cover-letter paths use):
            // the name is `.cvpreview__name { font-size: 1.6rem }` ≈ 1.9× the
            // 10pt body, and section titles carry NO CSS font-size - they inherit
            // the body size and read as headings via uppercase + bold + colour.
            let cv_scale = match b.level {
                BlockLevel::H1 => 1.9,
                BlockLevel::H2 | BlockLevel::H3 => 1.0,
                BlockLevel::Body
                | BlockLevel::Bullet
                | BlockLevel::EntryHead
                | BlockLevel::EntryRole => 1.0,
            };

            RenderBlock {
                level: b.level,
                font_family: eff.font_family,
                size_pt: eff.size_pt * cv_scale,
                rgb,
                // The name and entry company are bold; SECTION TITLES ARE NOT -
                // the editor's `.cvpreview__section-title` sets no font-weight
                // (uppercase + colour carry the hierarchy).
                bold: b.level == BlockLevel::H1
                    || b.level == BlockLevel::EntryHead
                    || b.bold
                    || eff.weight >= 600,
                italic: b.level == BlockLevel::EntryRole && theme.entry_role_italic,
                text,
                right_text,
                right_rgb: section_color.unwrap_or(body_rgb),
                rule_below,
                section_key: b.section_key.clone(),
            }
        })
        .collect();

    // Header rule sits under the contact line: attach to the last leading
    // `personal_details` block (matches the preview, where the rule underlines
    // the whole header block, not just the name).
    if let Some(rule) = theme.header_rule {
        if let Some(idx) = out
            .iter()
            .rposition(|b| b.section_key.as_deref() == Some("personal_details"))
        {
            out[idx].rule_below = Some(rule);
        }
    }

    out
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
                italic: false,
                text: b.text.clone(),
                right_text: None,
                right_rgb: eff.rgb,
                rule_below: None,
                section_key: b.section_key.clone(),
            }
        })
        .collect()
}

/// Parses already-rendered markdown (the tailored-CV journal path, which has no
/// per-section style) into blocks tagged with no section key - they resolve to
/// the document-wide style. A `**wrapped**` line becomes bold body text.
pub(crate) fn md_to_blocks(content_md: &str) -> Vec<StyledBlock> {
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
    let page = resolve_page(&crate::commands::documents_style::PageSettings::default());
    // Journal exports have no section tags; a photo (when present) sits at the
    // top of the document - AboveCenter mirrors that top placement.
    render_blocks_docx(
        &resolved,
        photo,
        crate::commands::documents_style::PhotoPlacement::AboveCenter,
        &page,
    )
}

/// Builds a styled DOCX paragraph from a `RenderBlock`. Single source of the
/// per-block run styling + vertical rhythm, reused by the main body flow, the
/// photo-beside-header table cell, and the below-table blocks so all three stay
/// pixel-identical. docx-rs paragraphs are flush by default, which reads as
/// cramped next to the spaced PDF; the before/after (twips, 1/20 pt) scale to
/// the block size so headings breathe and body/bullets stay tight.
fn block_paragraph(b: &RenderBlock, content_tw: i32) -> docx_rs::Paragraph {
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
        if b.italic {
            run = run.italic();
        }
        run
    };
    let (before, after) = match b.level {
        // The name sits flush at the top like the editor's `.cvpreview__name
        // { margin: 0 }`; H2/H3 keep air above to separate sections.
        BlockLevel::H1 => (0, (b.size_pt * 3.0).round() as u32),
        BlockLevel::H2 | BlockLevel::H3 => (
            (b.size_pt * 9.0).round() as u32,
            (b.size_pt * 3.0).round() as u32,
        ),
        // Entry lead gets air above (separates entries); its role line hugs it.
        BlockLevel::EntryHead => ((b.size_pt * 4.0).round() as u32, 0),
        BlockLevel::EntryRole => (0, (b.size_pt * 1.5).round() as u32),
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
    // Right-aligned column tail (entry location/dates): a right tab stop at the
    // content edge + tab + regular-weight run in the body colour - the DOCX
    // equivalent of the editor's flex row.
    if let Some(right) = &b.right_text {
        let (rr, rg, rb) = b.right_rgb;
        let rc = format!("{rr:02X}{rg:02X}{rb:02X}");
        para = para.add_tab(
            Tab::new()
                .val(TabValueType::Right)
                .pos(content_tw.max(0) as usize),
        );
        // Regular weight/upright (no bold/italic set): the editor's
        // location/dates column is plain body text even when the left side is
        // bold or italic.
        let run = Run::new()
            .add_tab()
            .add_text(right)
            .size((b.size_pt * 2.0).round() as usize)
            .color(&rc)
            .fonts(
                RunFonts::new()
                    .ascii(&b.font_family)
                    .hi_ansi(&b.font_family),
            );
        para = para.add_run(run);
    }
    if b.level == BlockLevel::Bullet {
        para = para.indent(Some(360), None, None, None);
    }
    // Divider rule - a bottom paragraph border, the DOCX mirror of the
    // preview's section/header underline. OOXML border `size` is in eighths of
    // a point.
    if let Some(rule) = b.rule_below {
        let (rr, rg, rb) = rule.rgb;
        let rc = format!("{rr:02X}{rg:02X}{rb:02X}");
        let sz = ((rule.pt * 8.0).round() as usize).max(2);
        // `set_border` merges onto `ParagraphBorders::default()`, which has all
        // four sides set to a visible Single border - that renders as a full box
        // around the heading, not an underline. Build from `with_empty()` so ONLY
        // the bottom edge is drawn.
        para.property = para.property.set_borders(
            ParagraphBorders::with_empty().set(
                ParagraphBorder::new(ParagraphBorderPosition::Bottom)
                    .val(BorderType::Single)
                    .size(sz)
                    .space(1)
                    .color(rc),
            ),
        );
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

// ── DOCX font embedding ───────────────────────────────────────────────────────
//
// docx-rs has no font-embedding API, so a .docx that names a non-standard font
// (Lato, Open Sans - the theme fonts Word/WPS don't ship) renders with a
// substitute, diverging from the preview/PDF (which embed the real face). We
// close that gap by post-processing the packed .docx zip: inject the TrueType
// faces the document actually uses as OOXML embedded fonts so it renders
// identically everywhere. Standard fonts (Calibri, Arial, Times, Georgia) are
// left un-embedded - every Office install already has them.

/// A bundled face to embed, tied to the exact `w:name` its runs reference.
struct EmbedFace {
    name: &'static str,
    regular: &'static [u8],
    bold: &'static [u8],
}

/// The non-standard bundled faces actually referenced by these blocks - the only
/// ones worth embedding (Word lacks them). Standard families resolve to a font
/// the viewer already has, so they're skipped.
fn faces_to_embed(blocks: &[RenderBlock]) -> Vec<EmbedFace> {
    let mut want_lato = false;
    let mut want_open = false;
    for b in blocks {
        let f = b.font_family.to_lowercase();
        if f.contains("lato") {
            want_lato = true;
        } else if f.contains("open sans") || f.contains("opensans") {
            want_open = true;
        }
    }
    let mut out = Vec::new();
    if want_lato {
        out.push(EmbedFace {
            name: "Lato",
            regular: FONT_LATO_R,
            bold: FONT_LATO_B,
        });
    }
    if want_open {
        out.push(EmbedFace {
            name: "Open Sans",
            regular: FONT_OPENSANS_R,
            bold: FONT_OPENSANS_B,
        });
    }
    out
}

/// A stable 128-bit GUID for embedded-font part `idx`, returned as both the raw
/// 32-hex string (used to obfuscate the bytes) and the braced form (the
/// `w:fontKey` Word reads to de-obfuscate). Fixed, not random - the value only
/// has to agree between the two.
fn font_guid(idx: u32) -> (String, String) {
    let base: u128 = 0xA1B2_C3D4_E5F6_0718_293A_4B5C_6D7E_8F90;
    let g = base ^ (idx as u128);
    let hex = format!("{g:032X}");
    let braced = format!(
        "{{{}-{}-{}-{}-{}}}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32],
    );
    (hex, braced)
}

/// OOXML embedded-font obfuscation (ECMA-376 §17.8.1): XOR the first 32 bytes
/// with the 16-byte fontKey applied in reverse. Symmetric - Word runs the same
/// pass to recover the TrueType file.
fn obfuscate_font(data: &[u8], guid_hex32: &str) -> Vec<u8> {
    let key: Vec<u8> = (0..16)
        .map(|i| u8::from_str_radix(&guid_hex32[i * 2..i * 2 + 2], 16).unwrap_or(0))
        .collect();
    let mut out = data.to_vec();
    for (i, byte) in out.iter_mut().take(32).enumerate() {
        *byte ^= key[15 - (i % 16)];
    }
    out
}

/// Rewrites the packed .docx to embed `faces`: adds obfuscated `.odttf` parts,
/// declares them in `fontTable.xml` (+ its rels), registers the `odttf`
/// content type, and flips `embedTrueTypeFonts` in `settings.xml`. No-op when
/// there's nothing non-standard to embed.
fn embed_fonts_in_docx(docx: Vec<u8>, faces: &[EmbedFace]) -> Result<Vec<u8>, String> {
    if faces.is_empty() {
        return Ok(docx);
    }
    use std::io::{Read, Write};

    // Read every existing part into memory, preserving order.
    let mut zin = zip::ZipArchive::new(std::io::Cursor::new(&docx))
        .map_err(|e| format!("docx zip read: {e}"))?;
    let mut files: Vec<(String, Vec<u8>)> = Vec::with_capacity(zin.len());
    for i in 0..zin.len() {
        let mut f = zin.by_index(i).map_err(|e| format!("docx entry: {e}"))?;
        let name = f.name().to_string();
        if name.ends_with('/') {
            continue;
        }
        let mut buf = Vec::new();
        f.read_to_end(&mut buf)
            .map_err(|e| format!("docx read entry: {e}"))?;
        files.push((name, buf));
    }

    // Build the obfuscated font parts + the fontTable/rels fragments.
    let mut font_entries = String::new(); // <w:font>… injected into fontTable.xml
    let mut rels = String::new(); // <Relationship>… for fontTable.xml.rels
    let mut idx: u32 = 0;
    for face in faces {
        idx += 1;
        let reg_file = format!("word/fonts/font{idx}.odttf");
        let reg_rid = format!("rIdFont{idx}");
        let (reg_hex, reg_key) = font_guid(idx);
        files.push((reg_file.clone(), obfuscate_font(face.regular, &reg_hex)));

        idx += 1;
        let bold_file = format!("word/fonts/font{idx}.odttf");
        let bold_rid = format!("rIdFont{idx}");
        let (bold_hex, bold_key) = font_guid(idx);
        files.push((bold_file.clone(), obfuscate_font(face.bold, &bold_hex)));

        font_entries.push_str(&format!(
            "<w:font w:name=\"{name}\"><w:charset w:val=\"00\"/><w:family w:val=\"swiss\"/>\
             <w:pitch w:val=\"variable\"/><w:embedRegular r:id=\"{reg_rid}\" w:fontKey=\"{reg_key}\"/>\
             <w:embedBold r:id=\"{bold_rid}\" w:fontKey=\"{bold_key}\"/></w:font>",
            name = face.name,
        ));
        rels.push_str(&format!(
            "<Relationship Id=\"{reg_rid}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/font\" Target=\"fonts/font{reg}.odttf\"/>\
             <Relationship Id=\"{bold_rid}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/font\" Target=\"fonts/font{bold}.odttf\"/>",
            reg = idx - 1,
            bold = idx,
        ));
    }

    // Patch the three existing parts in place.
    for (name, bytes) in files.iter_mut() {
        match name.as_str() {
            "word/fontTable.xml" => {
                let xml = String::from_utf8_lossy(bytes)
                    .replace("</w:fonts>", &format!("{font_entries}</w:fonts>"));
                *bytes = xml.into_bytes();
            }
            "[Content_Types].xml" => {
                let s = String::from_utf8_lossy(bytes);
                if !s.contains("Extension=\"odttf\"") {
                    let xml = s.replace(
                        "</Types>",
                        "<Default ContentType=\"application/vnd.openxmlformats-officedocument.obfuscatedFont\" Extension=\"odttf\"/></Types>",
                    );
                    *bytes = xml.into_bytes();
                }
            }
            "word/settings.xml" => {
                let s = String::from_utf8_lossy(bytes);
                if !s.contains("<w:embedTrueTypeFonts") {
                    // Insert right after the <w:settings …> start tag. Word tolerates
                    // the flag's position (docx-rs already emits settings out of
                    // strict schema order).
                    if let Some(pos) = s
                        .find("<w:settings")
                        .and_then(|start| s[start..].find('>').map(|o| start + o + 1))
                    {
                        let mut xml = String::with_capacity(s.len() + 32);
                        xml.push_str(&s[..pos]);
                        xml.push_str("<w:embedTrueTypeFonts/>");
                        xml.push_str(&s[pos..]);
                        *bytes = xml.into_bytes();
                    }
                }
            }
            _ => {}
        }
    }

    // New part: fontTable.xml.rels.
    files.push((
        "word/_rels/fontTable.xml.rels".to_string(),
        format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
             <Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">{rels}</Relationships>"
        )
        .into_bytes(),
    ));

    // Repack.
    let mut buf = Vec::new();
    {
        let mut zout = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, bytes) in &files {
            zout.start_file(name, opts)
                .map_err(|e| format!("docx zip write {name}: {e}"))?;
            zout.write_all(bytes)
                .map_err(|e| format!("docx zip write body {name}: {e}"))?;
        }
        zout.finish().map_err(|e| format!("docx zip finish: {e}"))?;
    }
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
    placement: crate::commands::documents_style::PhotoPlacement,
    page: &PageConfig,
) -> Result<Vec<u8>, String> {
    use crate::commands::documents_style::PhotoPlacement;
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

    // Printable width in twips - the right-tab position for two-column entry
    // lines (location/dates flush with the right margin, as in the editor).
    let content_tw = tw(page.width_mm - page.margin.left - page.margin.right);

    // docx-rs 0.4: `Pic::new(&[u8])` decodes/re-encodes and computes pixel
    // size; we override the box to ~2.7cm x 3.6cm (3:4) in EMU (914400 EMU/inch).
    // Match the editor's 90×120px photo (96dpi → 0.9375in × 1.25in in EMU,
    // 914400 EMU/in).
    let pic = photo.map(|bytes| Pic::new(bytes).size(857_250, 1_143_000));
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
                    text_cell = text_cell.add_paragraph(block_paragraph(b, content_tw));
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
                doc = doc.add_paragraph(block_paragraph(b, content_tw));
            }
        }
        (Some(pic), PhotoPlacement::AboveCenter) => {
            doc = doc.add_paragraph(
                Paragraph::new()
                    .align(AlignmentType::Center)
                    .add_run(Run::new().add_image(pic)),
            );
            for b in blocks {
                doc = doc.add_paragraph(block_paragraph(b, content_tw));
            }
        }
        (None, _) => {
            for b in blocks {
                doc = doc.add_paragraph(block_paragraph(b, content_tw));
            }
        }
    }

    // Embed any non-standard face the document uses (e.g. Lato) so the .docx
    // renders identically to the preview/PDF instead of substituting a font.
    embed_fonts_in_docx(finish_docx(doc)?, &faces_to_embed(blocks))
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

/// Resolves a path the frontend asked to open and refuses anything outside the
/// app's own data directory.
///
/// Both commands below hand the path to the OS launcher, which will happily
/// run an application bundle or a script. The only paths these commands are
/// meant to receive are `generated_docs.file_path` rows - exports Applye wrote
/// itself under `app_data_dir/companies/<slug>/`. Nothing validated that, so a
/// bug or a compromised renderer could ask the backend to launch any file on
/// disk. Containment is cheap here and the callers already satisfy it.
///
/// `canonicalize` on both sides is what makes the check meaningful: it
/// resolves `..` segments and follows symlinks, so a link inside the data
/// directory pointing at `/Applications/Something.app` fails the prefix test
/// rather than passing it.
fn resolve_app_owned_file(app: &AppHandle, path: &str) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    resolve_within(&base, path)
}

/// The containment rule on its own, so it can be tested without an `AppHandle`.
fn resolve_within(base: &std::path::Path, path: &str) -> Result<std::path::PathBuf, String> {
    let base = base
        .canonicalize()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let target = std::path::Path::new(path)
        .canonicalize()
        .map_err(|e| format!("no such file: {e}"))?;
    if !target.starts_with(&base) {
        return Err("refused: that file is outside Applye's own document folder".to_string());
    }
    if !target.is_file() {
        return Err("refused: not a regular file".to_string());
    }
    Ok(target)
}

#[tauri::command]
pub fn open_file(app: AppHandle, path: String) -> Result<(), String> {
    let path = resolve_app_owned_file(&app, &path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    // `cmd /C start` on Windows is the one launcher that re-parses its
    // arguments, so it is the only place a metacharacter in a filename could
    // matter. Two things keep it safe: every name Applye writes goes through
    // `readable_slug` (alphanumeric plus hyphen, nothing else survives), and
    // the containment check above means no path from outside that folder ever
    // reaches here. The empty `""` is `start`'s title argument - without it,
    // `start` treats a quoted path as the window title and opens nothing.
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path.to_string_lossy().to_string()])
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
pub fn reveal_in_folder(app: AppHandle, path: String) -> Result<(), String> {
    let path = resolve_app_owned_file(&app, &path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args([std::ffi::OsStr::new("-R"), path.as_os_str()])
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.to_string_lossy()))
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "linux")]
    {
        let parent = path.parent().unwrap_or(path.as_path());
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
    // The PDF renderer moved to its own module; its tests moved with it except
    // these, which measure text against the embedded faces the DOCX side also
    // uses.
    use crate::commands::documents_style::{CvSectionStyle, CvStyle, PhotoPlacement};
    use crate::commands::tailoring_fonts::FONT_CARLITO_R;
    use crate::commands::tailoring_pdf::{
        pdf_font_bytes, pick_pdf_family, text_width_pt, wrap_measured, PdfFamily, EMBEDDED_FACES,
    };
    use std::collections::HashMap;

    // ── open_file / reveal_in_folder containment ────────────────────────────

    /// A scratch "app data dir" with one export inside it, plus a sibling
    /// directory standing in for the rest of the disk.
    fn containment_fixture() -> (std::path::PathBuf, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("applye-contain-{}", std::process::id()));
        let inside = root.join("app-data").join("companies").join("acme");
        let outside = root.join("elsewhere");
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(inside.join("cv.pdf"), b"%PDF-1.4").unwrap();
        std::fs::write(outside.join("payload.sh"), b"#!/bin/sh\n").unwrap();
        (root.join("app-data"), outside)
    }

    #[test]
    fn allows_a_file_inside_the_app_data_dir() {
        let (base, _) = containment_fixture();
        let target = base.join("companies").join("acme").join("cv.pdf");
        let out = resolve_within(&base, target.to_str().unwrap());
        assert!(out.is_ok(), "got: {out:?}");
    }

    #[test]
    fn refuses_a_file_outside_the_app_data_dir() {
        let (base, outside) = containment_fixture();
        let target = outside.join("payload.sh");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("a path outside the data dir must be refused");
        assert!(err.contains("outside"), "got: {err}");
    }

    #[test]
    fn refuses_a_traversal_that_climbs_out() {
        let (base, _) = containment_fixture();
        // Syntactically "inside", but `..` walks it back out to the sibling.
        let target = base.join("companies/../../elsewhere/payload.sh");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("`..` must not escape the data dir");
        assert!(err.contains("outside"), "got: {err}");
    }

    #[test]
    fn refuses_a_directory() {
        let (base, _) = containment_fixture();
        let target = base.join("companies").join("acme");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("a directory is not an exported document");
        assert!(err.contains("not a regular file"), "got: {err}");
    }

    #[test]
    fn refuses_a_path_that_does_not_exist() {
        let (base, _) = containment_fixture();
        let target = base.join("companies").join("acme").join("missing.pdf");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("a missing file must not be launched");
        assert!(err.contains("no such file"), "got: {err}");
    }

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

    fn sb(level: BlockLevel, key: Option<&str>, text: &str, bold: bool) -> StyledBlock {
        StyledBlock {
            level,
            section_key: key.map(str::to_string),
            text: text.into(),
            bold,
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
        assert!(!u.iter().any(|s| s.bold));
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
        use crate::commands::documents_style::{MarginSpec, PageSettings};
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
        use crate::commands::documents_style::{MarginSpec, PageMargins, PageSettings};
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
    fn builtin_theme_mirrors_aurora_and_classic_tokens() {
        let aurora = builtin_theme(Some(2));
        assert_eq!(aurora.accent_rgb, (0x1B, 0x74, 0x64));
        assert_eq!(aurora.font_family, "Lato");
        assert_eq!(aurora.base_size_pt, 10.0);
        assert!(aurora.header_title_accent);
        assert!(aurora.section_title_accent);
        assert!(aurora.entry_company_accent);
        assert!(aurora.entry_role_italic);
        assert!(aurora.section_rule.is_some());
        assert!(aurora.header_rule.is_some());

        // Classic (id 1) and any unknown/absent id → dark, rule-less.
        for id in [Some(1), None, Some(99)] {
            let c = builtin_theme(id);
            assert_eq!(c.accent_rgb, (0x33, 0x33, 0x33));
            assert_eq!(c.font_family, "Calibri");
            assert!(!c.header_title_accent);
            assert!(!c.section_title_accent);
            assert!(!c.entry_company_accent);
            assert!(!c.entry_role_italic);
            assert!(c.section_rule.is_none());
            assert!(c.header_rule.is_none());
        }
    }

    #[test]
    fn resolve_cv_blocks_keeps_body_dark_and_accents_only_titles() {
        // The green-everywhere regression guard: on Aurora (green accent) body
        // and bullets stay dark; only name/section-title/company take the accent.
        let theme = builtin_theme(Some(2));
        let style = CvStyle {
            accent_color_hex: "#1B7464".into(),
            ..CvStyle::default()
        };
        let blocks = vec![
            sb(BlockLevel::H1, Some("personal_details"), "Jane Doe", false),
            sb(
                BlockLevel::Body,
                Some("personal_details"),
                "jane@x.com",
                false,
            ),
            sb(BlockLevel::H2, Some("summary"), "Summary", false),
            sb(BlockLevel::Body, Some("summary"), "Engineer.", false),
            sb(BlockLevel::EntryHead, Some("experience"), "Acme", false),
            sb(
                BlockLevel::EntryRole,
                Some("experience"),
                "Dev · 2020 - 2023",
                false,
            ),
            sb(BlockLevel::Bullet, Some("experience"), "Did things", false),
        ];
        let r = resolve_cv_blocks(&style, &theme, &blocks);
        let accent = (0x1B, 0x74, 0x64);
        let dark = (51, 51, 51);
        assert_eq!(r[0].rgb, accent, "name → accent (Aurora header title)");
        assert_eq!(r[2].rgb, accent, "section title → accent");
        assert_eq!(r[4].rgb, accent, "entry company → accent");
        assert_eq!(r[3].rgb, dark, "summary body stays dark");
        assert_eq!(r[6].rgb, dark, "bullet stays dark");
        assert_eq!(r[5].rgb, dark, "entry role stays dark");
        assert!(r[5].italic, "entry role italic in Aurora");
        // Section title carries the divider; body does not.
        assert!(r[2].rule_below.is_some(), "section title underline");
        assert!(r[3].rule_below.is_none());
        // Header rule attaches to the LAST personal_details block (contact).
        assert!(r[0].rule_below.is_none(), "name has no header rule");
        assert!(r[1].rule_below.is_some(), "contact carries the header rule");
        assert_eq!(r[2].text, "SUMMARY", "section title uppercased");
    }

    #[test]
    fn resolve_cv_blocks_classic_is_dark_and_rule_less() {
        let theme = builtin_theme(Some(1));
        let style = CvStyle::default(); // accent #333333
        let blocks = vec![
            sb(BlockLevel::H2, Some("summary"), "Summary", false),
            sb(BlockLevel::EntryRole, Some("experience"), "Dev", false),
        ];
        let r = resolve_cv_blocks(&style, &theme, &blocks);
        assert!(r[0].rule_below.is_none(), "Classic draws no section rule");
        assert!(!r[1].italic, "Classic role is not italic");
        assert_eq!(r[0].text, "SUMMARY", "section case is upper in Classic too");
    }

    #[test]
    fn resolve_cv_blocks_body_color_override_wins_but_never_accent() {
        let theme = builtin_theme(Some(2));
        let style = CvStyle {
            accent_color_hex: "#1B7464".into(),
            body_color_hex: Some("#123456".into()),
            ..CvStyle::default()
        };
        let r = resolve_cv_blocks(
            &style,
            &theme,
            &[sb(BlockLevel::Body, Some("summary"), "Text.", false)],
        );
        assert_eq!(
            r[0].rgb,
            (0x12, 0x34, 0x56),
            "body reads bodyColorHex, not accent"
        );
    }

    #[test]
    fn docx_embeds_lato_face_when_used() {
        use std::io::Read;
        let theme = builtin_theme(Some(2));
        let style = CvStyle {
            font_family: "Lato".into(),
            accent_color_hex: "#1B7464".into(),
            ..CvStyle::default()
        };
        let blocks = resolve_cv_blocks(
            &style,
            &theme,
            &[
                sb(BlockLevel::H2, Some("summary"), "Summary", false),
                sb(BlockLevel::Body, Some("summary"), "Hello world", false),
            ],
        );
        let page = resolve_page(&crate::commands::documents_style::PageSettings::default());
        let bytes =
            render_blocks_docx(&blocks, None, PhotoPlacement::AboveCenter, &page).expect("docx");

        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).expect("zip");
        let names: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(names.iter().any(|n| n == "word/fonts/font1.odttf"));
        assert!(names.iter().any(|n| n == "word/fonts/font2.odttf"));
        assert!(names.iter().any(|n| n == "word/_rels/fontTable.xml.rels"));

        let mut read = |name: &str| -> Vec<u8> {
            let mut f = zip.by_name(name).unwrap();
            let mut v = Vec::new();
            f.read_to_end(&mut v).unwrap();
            v
        };
        let ft = String::from_utf8(read("word/fontTable.xml")).unwrap();
        assert!(ft.contains("w:name=\"Lato\""));
        assert!(ft.contains("w:embedRegular"));
        assert!(ft.contains("w:embedBold"));
        let ct = String::from_utf8(read("[Content_Types].xml")).unwrap();
        assert!(ct.contains("Extension=\"odttf\""));
        let settings = String::from_utf8(read("word/settings.xml")).unwrap();
        assert!(settings.contains("<w:embedTrueTypeFonts"));

        // The embedded, obfuscated regular face must de-obfuscate (symmetric XOR
        // with the same fontKey) back to the real bundled Lato TTF header.
        let odttf = read("word/fonts/font1.odttf");
        let (hex, _) = font_guid(1);
        let restored = obfuscate_font(&odttf, &hex);
        assert_eq!(
            &restored[..48],
            &FONT_LATO_R[..48],
            "embedded face round-trips to the real Lato bytes"
        );
    }

    #[test]
    fn pdf_photo_left_places_header_beside_and_body_below() {
        // AboveLeft: the personal_details header must render in the column to the
        // RIGHT of the photo (x well past the left margin), while body sections
        // sit full-width at the margin - the editor's photo-beside layout.
        let style = crate::commands::documents_style::CvStyle::default();
        let blocks = resolve_blocks(
            &style,
            &[
                sb(
                    BlockLevel::H1,
                    Some("personal_details"),
                    "Vitalii Kasap",
                    false,
                ),
                sb(
                    BlockLevel::Body,
                    Some("personal_details"),
                    "Contact line",
                    false,
                ),
                sb(BlockLevel::H2, Some("summary"), "Summary", false),
                sb(BlockLevel::Body, Some("summary"), "Body text here.", false),
            ],
            false,
        );
        let page = resolve_page(&crate::commands::documents_style::PageSettings::default());
        let photo: &[u8] = include_bytes!("../../test-assets/1x1.png");
        let out =
            render_blocks_pdf(&blocks, Some(photo), PhotoPlacement::AboveLeft, &page).unwrap();

        // printpdf writes text as `<size> Tf <x> <y> Td` - collect the x of each.
        let s = String::from_utf8_lossy(&out);
        let xs: Vec<f32> = s
            .match_indices(" Td")
            .filter_map(|(i, _)| {
                let head = &s[..i];
                let mut it = head.split_whitespace().rev();
                let _y = it.next()?;
                it.next()?.parse::<f32>().ok()
            })
            .collect();
        assert!(
            xs.iter().any(|&x| x > 120.0),
            "header should sit beside the photo (x offset), got {xs:?}"
        );
        assert!(
            xs.iter().any(|&x| x < 80.0),
            "body should be full-width at the margin, got {xs:?}"
        );
    }

    #[test]
    fn resolve_cv_blocks_splits_two_column_lines_and_unbolds_section_titles() {
        let theme = builtin_theme(Some(2));
        let style = CvStyle {
            accent_color_hex: "#1B7464".into(),
            ..CvStyle::default()
        };
        let r = resolve_cv_blocks(
            &style,
            &theme,
            &[
                sb(BlockLevel::H2, Some("experience"), "Experience", false),
                sb(
                    BlockLevel::EntryHead,
                    Some("experience"),
                    "Acme\tBerlin",
                    false,
                ),
                sb(
                    BlockLevel::EntryRole,
                    Some("experience"),
                    "Dev\t2020 - 2023",
                    false,
                ),
            ],
        );
        // Section titles are NOT bold - the editor carries hierarchy via
        // uppercase + colour only.
        assert!(!r[0].bold, "section title must not be bold");
        // `\t` splits into left text + right-aligned tail in the body colour.
        assert_eq!(r[1].text, "Acme");
        assert_eq!(r[1].right_text.as_deref(), Some("Berlin"));
        assert_eq!(r[1].right_rgb, (51, 51, 51), "tail uses body colour");
        assert!(r[1].bold, "company stays bold");
        assert_eq!(r[2].text, "Dev");
        assert_eq!(r[2].right_text.as_deref(), Some("2020 - 2023"));
    }

    #[test]
    fn resolve_cv_blocks_adds_entry_rule_under_role_for_aurora() {
        let theme = builtin_theme(Some(2));
        let style = CvStyle {
            accent_color_hex: "#1B7464".into(),
            ..CvStyle::default()
        };
        let r = resolve_cv_blocks(
            &style,
            &theme,
            &[sb(
                BlockLevel::EntryRole,
                Some("experience"),
                "Engineer",
                false,
            )],
        );
        let rule = r[0].rule_below.expect("aurora draws an entry rule");
        assert_eq!(rule.rgb, (0x66, 0x66, 0x66), "entry rule is muted");
        // Classic has no entry rule.
        let classic = builtin_theme(Some(1));
        let rc = resolve_cv_blocks(
            &CvStyle::default(),
            &classic,
            &[sb(
                BlockLevel::EntryRole,
                Some("experience"),
                "Engineer",
                false,
            )],
        );
        assert!(rc[0].rule_below.is_none());
    }

    #[test]
    fn docx_does_not_embed_standard_font() {
        let theme = builtin_theme(Some(1)); // Classic → Calibri (Word has it)
        let style = CvStyle::default();
        let blocks = resolve_cv_blocks(
            &style,
            &theme,
            &[sb(BlockLevel::Body, Some("summary"), "Hi", false)],
        );
        let page = resolve_page(&crate::commands::documents_style::PageSettings::default());
        let bytes =
            render_blocks_docx(&blocks, None, PhotoPlacement::AboveCenter, &page).expect("docx");
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).expect("zip");
        let has_fonts =
            (0..zip.len()).any(|i| zip.by_index(i).unwrap().name().starts_with("word/fonts/"));
        assert!(!has_fonts, "a standard font is not embedded");
    }

    #[test]
    fn pdf_embeds_font_for_proprietary_family() {
        // A "Calibri" CV renders through the embedded Carlito clone, so the PDF
        // carries an embedded TTF and is far larger than the same text drawn
        // with a builtin (non-embedded) monospace font. printpdf compresses
        // object streams, so we assert on the embedded-font footprint rather
        // than grepping for the font name.
        let render = |family: &str| {
            let style = crate::commands::documents_style::CvStyle {
                font_family: family.into(),
                ..crate::commands::documents_style::CvStyle::default()
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
            let page = resolve_page(&crate::commands::documents_style::PageSettings::default());
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
        let style = crate::commands::documents_style::CvStyle::default();
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
        let page = resolve_page(&crate::commands::documents_style::PageSettings {
            size: "letter".into(),
            margin: crate::commands::documents_style::MarginSpec::Preset("wide".into()),
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
        let style = crate::commands::documents_style::CvStyle::default();
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
        let page = resolve_page(&crate::commands::documents_style::PageSettings::default());
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
        let style = crate::commands::documents_style::CvStyle::default();
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
        let page = resolve_page(&crate::commands::documents_style::PageSettings::default());
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
