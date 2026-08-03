// What a document's chosen look resolves to. Split out of `tailoring.rs`, which
// was 1179 lines against an 800 budget and held this next to the block list it
// styles.
//
// Two halves of one question - what font, size, weight and colour does this
// block get? `CvTheme` is the built-in side: a hand-maintained Rust mirror of
// the TS `CvThemeDescriptor`, keyed by `theme_id`, with a parity test. The
// `effective_*` cascades are the user side: a per-section override falls back to
// the document-wide value, and for cover letters a per-paragraph override falls
// back to the `body` block first. The block list that reads the result stays in
// `tailoring`.

use super::tailoring::RuleSpec;
use crate::commands::documents_style::CvStyle;

pub(super) struct EffStyle {
    pub font_family: String,
    pub size_pt: f64,
    pub weight: i64,
    pub rgb: (u8, u8, u8),
}

pub(super) fn hex_to_rgb(hex: &str) -> (u8, u8, u8) {
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

/// CV cascade: per-section override field ?? document-wide field. Mirrors the
/// TS `effectiveSectionStyle`.
pub(super) fn effective_cv(style: &CvStyle, key: Option<&str>) -> EffStyle {
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
    pub(super) const TEXT_RGB: (u8, u8, u8) = (51, 51, 51);
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

/// Cover-letter cascade: a `body_<i>` paragraph override ?? the `body` block
/// style ?? document-wide. Mirrors the TS `effectiveCoverLetterParagraphStyle`.
pub(super) fn effective_cl(style: &CvStyle, key: Option<&str>) -> EffStyle {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::documents_style::CvSectionStyle;
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
}
