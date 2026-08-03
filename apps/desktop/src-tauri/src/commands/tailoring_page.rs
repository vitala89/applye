// Page geometry: millimetres and margins, resolved from the `PageSettings` a
// document persisted. Split out of `tailoring.rs`, which was 814 lines against
// an 800 budget and held this next to the block styling.
//
// A different question from everything else in that file - nothing here reads a
// font, a colour or a block. Both renderers and both export paths call
// `resolve_page` before laying anything out, and it is deliberately forgiving:
// an unknown size falls back to A4 and every margin is clamped, so a malformed
// `style_json` degrades instead of breaking the export.

use crate::commands::documents_style::PageSettings;

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
pub(crate) fn resolve_page(p: &PageSettings) -> PageConfig {
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
