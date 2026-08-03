// CV presentation contract (ROADMAP §16.5): the style choices a document
// carries, and the deterministic checks that judge them. Split out of
// `documents`, which owns the library rows themselves - nothing here reads
// the database or the filesystem, and nothing here renders. The renderers in
// `commands::tailoring` consume these types; `documents` resolves them out of
// a row's `style_json` at export time.

use serde::{Deserialize, Serialize};

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
// Variant names are the serialized wire format shared with the Angular side;
// renaming them to satisfy the lint would break stored CV templates.
#[allow(clippy::enum_variant_names)]
pub enum PhotoPlacement {
    #[default]
    AboveLeft,
    AboveCenter,
    AboveRight,
}

/// CV style choices (ROADMAP §16.5) - layout-adjacent but distinct from
/// `cv_templates` (section order/toggles): font, size, one accent colour.
/// Deserializes with safe defaults so a document with no `style_json` yet
/// (every CV before this feature) resolves to the safe default, not an error.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CvStyle {
    #[serde(default = "CvStyle::default_font_family")]
    pub font_family: String,
    #[serde(default = "CvStyle::default_font_size_pt")]
    pub font_size_pt: f64,
    #[serde(default = "CvStyle::default_accent_color_hex")]
    pub accent_color_hex: String,
    #[serde(default = "CvStyle::default_font_weight")]
    pub font_weight: i64,
    /// Document-wide body-text colour (mirrors the TS `CvStyle.bodyColorHex`).
    /// Distinct from `accent_color_hex`: body text reads this (or dark), never
    /// the accent - the no-accent-leak rule the export previously ignored.
    #[serde(default)]
    pub body_color_hex: Option<String>,
    #[serde(default)]
    pub section_styles: std::collections::HashMap<String, CvSectionStyle>,
    #[serde(default)]
    pub page: PageSettings,
}

impl CvStyle {
    fn default_font_family() -> String {
        "Calibri".to_string()
    }
    fn default_font_size_pt() -> f64 {
        11.0
    }
    fn default_accent_color_hex() -> String {
        "#333333".to_string()
    }
    fn default_font_weight() -> i64 {
        400
    }
}

impl Default for CvStyle {
    fn default() -> Self {
        Self {
            font_family: Self::default_font_family(),
            font_size_pt: Self::default_font_size_pt(),
            accent_color_hex: Self::default_accent_color_hex(),
            font_weight: Self::default_font_weight(),
            body_color_hex: None,
            section_styles: Default::default(),
            page: Default::default(),
        }
    }
}

/// Per-section style override (Wave B): any field left `None` falls back to
/// the parent `CvStyle`'s value when `check_style_safety_core` evaluates it.
#[derive(Debug, Default, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CvSectionStyle {
    pub font_family: Option<String>,
    pub font_size_pt: Option<f64>,
    pub color_hex: Option<String>,
    pub font_weight: Option<i64>,
}

/// Page geometry (portrait) stored in `style_json`. String fields (not enums)
/// so an unknown/legacy value deserializes cleanly and falls back at resolve
/// time rather than erroring, matching the rest of `CvStyle`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageMargins {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

/// Margin as stored: legacy preset string ("narrow"|"normal"|"wide") OR a
/// 4-side mm object. `resolve_page` normalises both to clamped mm.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MarginSpec {
    Preset(String),
    Sides(PageMargins),
}

impl Default for MarginSpec {
    fn default() -> Self {
        MarginSpec::Preset("normal".into())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageSettings {
    #[serde(default = "PageSettings::default_size")]
    pub size: String,
    #[serde(default)]
    pub margin: MarginSpec,
}

impl PageSettings {
    fn default_size() -> String {
        "a4".into()
    }
}

impl Default for PageSettings {
    fn default() -> Self {
        PageSettings {
            size: Self::default_size(),
            margin: MarginSpec::default(),
        }
    }
}

/// Curated ATS-safe font list (ROADMAP §16.5) - case-insensitive match.
/// Fonts outside this list aren't blocked, just flagged: some ATS parsers
/// choke on decorative/condensed/script fonts when extracting text.
const ATS_SAFE_FONTS: &[&str] = &[
    "arial",
    "calibri",
    "helvetica",
    "times new roman",
    "georgia",
    "lato",
    "open sans",
    "verdana",
    "tahoma",
    "garamond",
];

/// One ATS/readability note. `kind` selects the (translated, honestly
/// worded) message on the frontend; `detail` is the value to interpolate
/// (font name / point size / hex) - Rust never renders user-facing text.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StyleNote {
    pub kind: String,
    pub detail: String,
}

/// Deterministic, 0-token style-safety check. Two honestly distinct note
/// types (ROADMAP §16.5): `font_ats_risk` / `size_out_of_range` are about
/// ATS text-parsing risk; `color_readability_risk` is about print/greyscale
/// legibility, NOT ATS parsing - colour barely affects text extraction.
/// A note only appears when the value leaves the safe default.
#[tauri::command]
pub fn check_style_safety(style_json: Option<String>) -> Vec<StyleNote> {
    check_style_safety_core(style_json)
}

fn check_style_safety_core(style_json: Option<String>) -> Vec<StyleNote> {
    let style: CvStyle = style_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let mut notes = Vec::new();

    push_font_size_color_notes(
        &mut notes,
        &style.font_family,
        style.font_size_pt,
        &style.accent_color_hex,
    );
    if let Some(n) = weight_note(style.font_weight) {
        notes.push(n);
    }
    for o in style.section_styles.values() {
        let font = o.font_family.as_deref().unwrap_or(&style.font_family);
        let size = o.font_size_pt.unwrap_or(style.font_size_pt);
        let color = o.color_hex.as_deref().unwrap_or(&style.accent_color_hex);
        push_font_size_color_notes(&mut notes, font, size, color);
        if let Some(n) = weight_note(o.font_weight.unwrap_or(style.font_weight)) {
            notes.push(n);
        }
    }
    notes
}

/// Hard validator for an uploaded CvThemeDescriptor (future upload/marketplace
/// path). Returns a note per problem; empty = safe to store. Built-in themes
/// always pass. Deliberately strict: rejects malformed hex, out-of-range
/// numerics, and unknown enum values so untrusted descriptors cannot smuggle
/// unexpected values into the render path.
#[tauri::command]
pub fn validate_theme(descriptor_json: Option<String>) -> Vec<StyleNote> {
    validate_theme_core(descriptor_json)
}

fn is_hex_color(s: &str) -> bool {
    let b = s.as_bytes();
    (b.len() == 4 || b.len() == 7) && b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}

fn validate_theme_core(descriptor_json: Option<String>) -> Vec<StyleNote> {
    let mut notes: Vec<StyleNote> = Vec::new();
    let Some(raw) = descriptor_json else {
        return notes;
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
        notes.push(StyleNote {
            kind: "font_ats_risk".into(),
            detail: "malformed theme".into(),
        });
        return notes;
    };
    // hex tokens
    for path in [("tokens", "accentHex"), ("tokens", "mutedHex")] {
        if let Some(s) = v
            .get(path.0)
            .and_then(|o| o.get(path.1))
            .and_then(|x| x.as_str())
        {
            if !is_hex_color(s) {
                notes.push(StyleNote {
                    kind: "color_readability_risk".into(),
                    detail: s.into(),
                });
            }
        }
    }
    // size + weight ranges
    if let Some(sz) = v
        .get("tokens")
        .and_then(|o| o.get("baseSizePt"))
        .and_then(|x| x.as_f64())
    {
        if !(6.0..=18.0).contains(&sz) {
            notes.push(StyleNote {
                kind: "size_out_of_range".into(),
                detail: sz.to_string(),
            });
        }
    }
    if let Some(w) = v
        .get("tokens")
        .and_then(|o| o.get("fontWeight"))
        .and_then(|x| x.as_i64())
    {
        if ![300, 400, 600, 700].contains(&w) {
            notes.push(StyleNote {
                kind: "weight_unavailable_risk".into(),
                detail: w.to_string(),
            });
        }
    }
    // enum membership
    let check_enum = |notes: &mut Vec<StyleNote>, val: Option<&str>, allowed: &[&str]| {
        if let Some(s) = val {
            if !allowed.contains(&s) {
                notes.push(StyleNote {
                    kind: "font_ats_risk".into(),
                    detail: s.into(),
                });
            }
        }
    };
    check_enum(
        &mut notes,
        v.get("header")
            .and_then(|o| o.get("titleColor"))
            .and_then(|x| x.as_str()),
        &["accent", "text"],
    );
    check_enum(
        &mut notes,
        v.get("header")
            .and_then(|o| o.get("contactLayout"))
            .and_then(|x| x.as_str()),
        &["inline-pipe", "stacked"],
    );
    check_enum(
        &mut notes,
        v.get("sectionHeader")
            .and_then(|o| o.get("case"))
            .and_then(|x| x.as_str()),
        &["upper", "none"],
    );
    check_enum(
        &mut notes,
        v.get("sectionHeader")
            .and_then(|o| o.get("color"))
            .and_then(|x| x.as_str()),
        &["accent", "text"],
    );
    check_enum(
        &mut notes,
        v.get("entry")
            .and_then(|o| o.get("companyColor"))
            .and_then(|x| x.as_str()),
        &["accent", "text"],
    );
    check_enum(
        &mut notes,
        v.get("bullets")
            .and_then(|o| o.get("marker"))
            .and_then(|x| x.as_str()),
        &["disc", "textbullet"],
    );
    for k in ["header", "sectionHeader", "entry"] {
        check_enum(
            &mut notes,
            v.get(k)
                .and_then(|o| o.get("ruleColor"))
                .and_then(|x| x.as_str()),
            &["accent", "muted", "none"],
        );
    }
    notes
}

/// Shared ATS/size/colour checks, run once for the global style and once per
/// per-section override (with the override's effective, fallback-resolved
/// values) so both paths stay in lockstep.
fn push_font_size_color_notes(notes: &mut Vec<StyleNote>, font: &str, size: f64, color: &str) {
    if !ATS_SAFE_FONTS.contains(&font.trim().to_lowercase().as_str()) {
        notes.push(StyleNote {
            kind: "font_ats_risk".to_string(),
            detail: font.to_string(),
        });
    }
    if !(9.0..=13.0).contains(&size) {
        notes.push(StyleNote {
            kind: "size_out_of_range".to_string(),
            detail: format!("{size}"),
        });
    }
    if is_low_print_contrast(color) {
        notes.push(StyleNote {
            kind: "color_readability_risk".to_string(),
            detail: color.to_string(),
        });
    }
}

/// Curated fonts carry no per-weight metadata, so this note is a conservative,
/// truthful heuristic rather than a lookup: Light (300) is not reliably
/// shipped by the common ATS core fonts (Calibri, Arial, Times New Roman,
/// Georgia, Verdana), so only 300 is flagged. 400/600/700 are treated as
/// universally available and never flagged.
fn weight_note(weight: i64) -> Option<StyleNote> {
    if weight == 300 {
        Some(StyleNote {
            kind: "weight_unavailable_risk".to_string(),
            detail: "300".to_string(),
        })
    } else {
        None
    }
}

/// Flags an accent colour too light to stay legible once printed in
/// greyscale (e.g. by an Agentur für Arbeit printer) - a readability/print
/// concern, not an ATS-parsing one.
fn is_low_print_contrast(hex: &str) -> bool {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return false; // malformed value - don't nag, `check_style_safety` isn't a validator
    }
    let Ok(r) = u8::from_str_radix(&hex[0..2], 16) else {
        return false;
    };
    let Ok(g) = u8::from_str_radix(&hex[2..4], 16) else {
        return false;
    };
    let Ok(b) = u8::from_str_radix(&hex[4..6], 16) else {
        return false;
    };
    let luminance =
        0.2126 * (r as f64 / 255.0) + 0.7152 * (g as f64 / 255.0) + 0.0722 * (b as f64 / 255.0);
    luminance > 0.75
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_style_safety_is_quiet_on_the_safe_default() {
        assert!(check_style_safety_core(None).is_empty());
        let safe = r##"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333"}"##;
        assert!(check_style_safety_core(Some(safe.to_string())).is_empty());
    }

    #[test]
    fn validate_theme_accepts_builtin_aurora() {
        let aurora = r##"{"id":2,"name":"Aurora","version":1,"tokens":{"accentHex":"#1B7464","mutedHex":"#666666","fontFamily":"Lato","baseSizePt":10,"fontWeight":400},"header":{"titleColor":"accent","contactLayout":"inline-pipe","ruleWeightPt":0.8,"ruleColor":"accent"},"sectionHeader":{"case":"upper","color":"accent","ruleWeightPt":0.8,"ruleColor":"accent"},"entry":{"companyColor":"accent","roleItalic":true,"showIndustry":true,"ruleWeightPt":0.4,"ruleColor":"muted"},"bullets":{"marker":"textbullet"}}"##;
        assert!(validate_theme_core(Some(aurora.to_string())).is_empty());
    }

    #[test]
    fn validate_theme_flags_bad_hex_and_enum() {
        let bad = r##"{"id":9,"name":"X","version":1,"tokens":{"accentHex":"teal","mutedHex":"#666666","fontFamily":"Lato","baseSizePt":10,"fontWeight":400},"header":{"titleColor":"rainbow","contactLayout":"inline-pipe","ruleWeightPt":0.8,"ruleColor":"accent"},"sectionHeader":{"case":"upper","color":"accent","ruleWeightPt":0.8,"ruleColor":"accent"},"entry":{"companyColor":"accent","roleItalic":true,"showIndustry":true,"ruleWeightPt":0.4,"ruleColor":"muted"},"bullets":{"marker":"textbullet"}}"##;
        let notes = validate_theme_core(Some(bad.to_string()));
        assert!(!notes.is_empty());
    }

    #[test]
    fn check_style_safety_flags_bad_per_section_override() {
        let json = r##"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333","fontWeight":400,
            "sectionStyles":{"summary":{"fontSizePt":20.0,"colorHex":"#eeeeee"}}}"##;
        let notes = check_style_safety_core(Some(json.to_string()));
        assert!(notes.iter().any(|n| n.kind == "size_out_of_range"));
        assert!(notes.iter().any(|n| n.kind == "color_readability_risk"));
    }

    #[test]
    fn check_style_safety_flags_light_weight() {
        let json = r##"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333","fontWeight":300}"##;
        let notes = check_style_safety_core(Some(json.to_string()));
        assert!(notes.iter().any(|n| n.kind == "weight_unavailable_risk"));
    }

    #[test]
    fn check_style_safety_quiet_on_safe_per_section() {
        let json = r##"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333","fontWeight":700,
            "sectionStyles":{"skills":{"fontFamily":"Arial","fontWeight":600}}}"##;
        assert!(check_style_safety_core(Some(json.to_string())).is_empty());
    }

    #[test]
    fn check_style_safety_flags_risky_font_size_and_colour_independently() {
        let risky =
            r##"{"fontFamily":"Comic Sans MS","fontSizePt":18,"accentColorHex":"#FFFF66"}"##;
        let notes = check_style_safety_core(Some(risky.to_string()));
        let kinds: Vec<&str> = notes.iter().map(|n| n.kind.as_str()).collect();
        assert!(kinds.contains(&"font_ats_risk"));
        assert!(kinds.contains(&"size_out_of_range"));
        assert!(kinds.contains(&"color_readability_risk"));
        assert_eq!(notes.len(), 3);
    }

    #[test]
    fn check_style_safety_accepts_every_curated_safe_font_case_insensitively() {
        for font in ATS_SAFE_FONTS {
            let style = format!(
                r##"{{"fontFamily":"{}","fontSizePt":11,"accentColorHex":"#333333"}}"##,
                font.to_uppercase()
            );
            let notes = check_style_safety_core(Some(style));
            assert!(notes.is_empty(), "{font} should not be flagged");
        }
    }

    #[test]
    fn check_style_safety_ignores_a_malformed_hex_colour_instead_of_erroring() {
        let malformed =
            r#"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"not-a-color"}"#;
        let notes = check_style_safety_core(Some(malformed.to_string()));
        assert!(notes.iter().all(|n| n.kind != "color_readability_risk"));
    }

    #[test]
    fn photo_placement_defaults_and_roundtrips() {
        use super::PhotoPlacement;
        // Missing field → default AboveLeft.
        #[derive(serde::Deserialize)]
        struct Holder {
            #[serde(default)]
            placement: PhotoPlacement,
        }
        let h: Holder = serde_json::from_str("{}").unwrap();
        assert_eq!(h.placement, PhotoPlacement::AboveLeft);
        // snake_case round-trip for each variant.
        for (v, s) in [
            (PhotoPlacement::AboveLeft, "\"above_left\""),
            (PhotoPlacement::AboveCenter, "\"above_center\""),
            (PhotoPlacement::AboveRight, "\"above_right\""),
        ] {
            assert_eq!(serde_json::to_string(&v).unwrap(), s);
            assert_eq!(serde_json::from_str::<PhotoPlacement>(s).unwrap(), v);
        }
    }
}
