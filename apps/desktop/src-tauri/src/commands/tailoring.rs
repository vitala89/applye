// The shared export model: one structured block list that both exporters render
// from, plus the theme and style cascade they both read.
//
// Nothing here touches the database, the filesystem or the shell - that half is
// `tailoring_journal`. The renderers are `tailoring_docx` and `tailoring_pdf`,
// and they stay separate from this module so neither format owns the model.

pub(crate) use super::tailoring_pdf::render_blocks_pdf;

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

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    // The PDF renderer moved to its own module; its tests moved with it except
    // these, which measure text against the embedded faces the DOCX side also
    // uses.
    use crate::commands::documents_style::{CvSectionStyle, CvStyle, PhotoPlacement};
    use crate::commands::tailoring_docx::render_blocks_docx;
    use crate::commands::tailoring_fonts::FONT_CARLITO_R;
    use crate::commands::tailoring_pdf::{
        pdf_font_bytes, pick_pdf_family, text_width_pt, wrap_measured, PdfFamily, EMBEDDED_FACES,
    };
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

    pub(crate) fn sb(level: BlockLevel, key: Option<&str>, text: &str, bold: bool) -> StyledBlock {
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
