// Rendering the structured blocks to PDF.
//
// Split out of `tailoring.rs`, which was 2538 lines against an 800 budget. This
// is the printpdf half: the embedded font faces, the family mapping, glyph
// measurement, the line wrapper that measures rather than guesses, and the
// renderer that lays blocks onto pages.
//
// It touches no database and no filesystem - `export_pdf` stays behind with the
// command layer. Everything here turns content already in hand into bytes,
// which is why the wrapper and the placement can be asserted in tests.

use crate::commands::documents_style::CvStyle;

use super::tailoring::{
    md_to_blocks, resolve_blocks, resolve_page, BlockLevel, PageConfig, RenderBlock,
};
use super::tailoring_fonts::*;

/// Tailored-CV journal export (markdown in, document-wide default style).
pub(crate) fn md_to_pdf_bytes(content_md: &str, photo: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let blocks = md_to_blocks(content_md);
    let resolved = resolve_blocks(&CvStyle::default(), &blocks, false);
    let page = resolve_page(&crate::commands::documents_style::PageSettings::default());
    render_blocks_pdf(
        &resolved,
        photo,
        crate::commands::documents_style::PhotoPlacement::default(),
        &page,
    )
}

// ── Embedded CV fonts ───────────────────────────────────────────────────────
// Metric-compatible, freely-redistributable clones of the proprietary ATS-safe
// fonts, embedded so the printpdf export renders the user's chosen family
// instead of a base-font approximation. Regular + Bold per family; monospace
// families keep the printpdf builtin Courier (already a real monospace metric).
// See assets/fonts/NOTICE.md for the clone→original mapping and licenses.

/// Which embedded face renders a given user font family. `Courier` is the odd
/// one out: no bundled clone, it falls back to the printpdf builtin.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub(super) enum PdfFamily {
    Carlito,  // Calibri clone (also the default fallback - matches CvStyle default)
    Arimo,    // Arial / Helvetica clone; also covers Verdana/Tahoma (no closer ATS clone)
    Tinos,    // Times New Roman clone; also covers Garamond/Cambria/generic serif
    Gelasio,  // Georgia clone
    Lato,     // native OFL font
    OpenSans, // native OFL font
    Courier,  // builtin (monospace) - no embedded bytes
}

/// Map a user font-family string to the nearest bundled face. Specific names are
/// matched before the generic `serif`/`sans` fallbacks so e.g. "Georgia" hits
/// Gelasio rather than the serif catch-all.
pub(super) fn pick_pdf_family(family: &str) -> PdfFamily {
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
pub(super) fn pdf_font_bytes(fam: PdfFamily, bold: bool) -> Option<&'static [u8]> {
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
pub(super) const EMBEDDED_FACES: &[(PdfFamily, bool)] = &[
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
/// advances of `face`. Missing glyphs contribute zero - a negligible
/// under-estimate for the odd unsupported character.
pub(super) fn text_width_pt(text: &str, size_pt: f32, face: &ttf_parser::Face) -> f32 {
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
pub(super) fn wrap_measured(
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
    placement: crate::commands::documents_style::PhotoPlacement,
    page: &PageConfig,
) -> Result<Vec<u8>, String> {
    use crate::commands::documents_style::PhotoPlacement;
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
    // only load the (family, weight) pairs the blocks actually use - otherwise
    // every PDF would carry all ~5 MB of bundled faces.
    let mut needed: std::collections::HashSet<(PdfFamily, bool)> = std::collections::HashSet::new();
    for b in blocks {
        let fam = pick_pdf_family(&b.font_family);
        if fam != PdfFamily::Courier {
            needed.insert((fam, b.bold));
            // Right-aligned column tails always draw with the regular face.
            if b.right_text.is_some() {
                needed.insert((fam, false));
            }
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

    // Photo-beside-header state for side placements: `(header_dx, right_shrink,
    // photo_bottom_mm)`. `header_dx` shifts the header (personal_details) text
    // right of a left photo; `right_shrink` narrows it for a right photo;
    // `photo_bottom_mm` is where body content resumes below the photo. `None`
    // for center placement / no photo (text stacks under the photo as before).
    let mut photo_beside: Option<(f32, f32, f32)> = None;
    // Match the editor's `.cvpreview__photo` 12px gap (12 / (96/25.4) mm).
    let photo_gap = 3.18_f32;

    if let Some(bytes) = photo {
        // printpdf 0.7 (`embedded_images`): decode with the crate's re-exported
        // `image` (0.24) so the `DynamicImage` type matches. Force the same
        // ~2.7cm x 3.6cm box as DOCX (independent x/y scale) and place it
        // top-left; text then starts below it - mirroring the DOCX inline-top
        // placement instead of the old top-right overlay that clipped headings.
        let dynimg = printpdf::image_crate::load_from_memory(bytes)
            .map_err(|e| format!("pdf photo decode: {e}"))?;
        let (px_w, px_h) = (dynimg.width() as f32, dynimg.height() as f32);
        let img = Image::from_dynamic_image(&dynimg);
        let dpi = 300.0_f32;
        let nat_w_mm = px_w / dpi * 25.4;
        let nat_h_mm = px_h / dpi * 25.4;
        // Match the editor's `.cvpreview__photo` box: 90×120px at 96dpi =
        // 0.9375in × 1.25in = 23.81mm × 31.75mm.
        let (box_w, box_h) = (23.8125_f32, 31.75_f32);
        // Photo x-origin. `AboveCenter` centres the photo (content stacks
        // below). `AboveLeft`/`AboveRight` place it in the corresponding margin
        // and let the header text flow beside it (matching the editor's float),
        // dropping below once the header ends.
        let photo_x = match placement {
            PhotoPlacement::AboveCenter => {
                let usable_w = page_w_mm - margin_mm - right_margin_mm;
                Mm(margin_mm + (usable_w - box_w) / 2.0)
            }
            PhotoPlacement::AboveLeft => margin,
            PhotoPlacement::AboveRight => Mm(page_w_mm - right_margin_mm - box_w),
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
        match placement {
            PhotoPlacement::AboveLeft => {
                photo_beside = Some((box_w + photo_gap, 0.0, top_y - box_h));
            }
            PhotoPlacement::AboveRight => {
                photo_beside = Some((0.0, box_w + photo_gap, top_y - box_h));
            }
            PhotoPlacement::AboveCenter => {
                y = top_y - box_h - 8.0;
            }
        }
    }

    let mut cleared_photo = false;
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
        let is_pd = b.section_key.as_deref() == Some("personal_details");

        // Photo-beside header: personal_details lines flow in the column next to
        // the photo; the first block after the header drops below the photo and
        // everything from there is full-width.
        let (base_x, avail_mm) = match photo_beside {
            Some((header_dx, right_shrink, _)) if is_pd && !cleared_photo => {
                let bx = margin_mm + header_dx;
                (bx, page_w_mm - bx - right_margin_mm - right_shrink)
            }
            Some((_, _, photo_bottom)) if !cleared_photo => {
                if y > photo_bottom - photo_gap {
                    y = photo_bottom - photo_gap;
                }
                cleared_photo = true;
                let bx = if bullet { indent_mm } else { margin_mm };
                (bx, page_w_mm - bx - right_margin_mm)
            }
            _ => {
                let bx = if bullet { indent_mm } else { margin_mm };
                (bx, page_w_mm - bx - right_margin_mm)
            }
        };

        // Right-aligned column tail (entry location/dates): drawn with the
        // regular face in the body colour, flush with the right margin on the
        // block's first line - the editor's two-column entry row.
        const PT_TO_MM: f32 = 0.352_777_8;
        let right_col = b.right_text.as_deref().map(|txt| {
            let (rfont, rface) = match fam {
                PdfFamily::Courier => (&courier, None),
                _ => (
                    refs.get(&(fam, false)).expect("regular ref loaded"),
                    Some(faces.get(&(fam, false)).expect("regular face loaded")),
                ),
            };
            let w_mm = match rface {
                Some(f) => text_width_pt(txt, b.size_pt as f32, f) * PT_TO_MM,
                None => txt.chars().count() as f32 * 0.6 * b.size_pt as f32 * PT_TO_MM,
            };
            (txt, rfont, w_mm)
        });
        // Narrow the left column so it never collides with the right tail.
        let avail_mm = match &right_col {
            Some((_, _, w)) => (avail_mm - w - 4.0).max(10.0),
            None => avail_mm,
        };

        // Wrap to the printable width - printpdf's `use_text` never wraps, so a
        // long line would run off the right edge and be clipped. Measure each
        // candidate line against the embedded font's real glyph advances.
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
            // Right-aligned tail on the block's first line only.
            if i == 0 {
                if let Some((txt, rfont, w_mm)) = &right_col {
                    let (rr, rg, rb) = b.right_rgb;
                    layer.set_fill_color(Color::Rgb(Rgb::new(
                        rr as f32 / 255.0,
                        rg as f32 / 255.0,
                        rb as f32 / 255.0,
                        None,
                    )));
                    let rx = page_w_mm - right_margin_mm - *w_mm;
                    layer.use_text(*txt, b.size_pt as f32, Mm(rx), Mm(y), rfont);
                }
            }
            y -= line_h;
        }
        // Divider rule under this block - the PDF mirror of the preview's
        // section/header underline. Drawn just below the last text line, across
        // the printable width, on the current page/layer.
        if let Some(rule) = b.rule_below {
            let (rr, rg, rb) = rule.rgb;
            let layer = doc.get_page(cur_page).get_layer(cur_layer);
            layer.set_outline_color(Color::Rgb(Rgb::new(
                rr as f32 / 255.0,
                rg as f32 / 255.0,
                rb as f32 / 255.0,
                None,
            )));
            layer.set_outline_thickness(rule.pt as f32);
            // In photo-beside mode the header rule belongs below the photo (its
            // owning contact line renders up beside the photo); everywhere else
            // it sits just under the block's last line.
            let ry = match photo_beside {
                Some((_, _, photo_bottom)) if is_pd => photo_bottom - photo_gap * 0.5,
                _ => y + line_h * 0.5,
            };
            let rule_line = Line {
                points: vec![
                    (Point::new(Mm(margin_mm), Mm(ry)), false),
                    (Point::new(Mm(page_w_mm - right_margin_mm), Mm(ry)), false),
                ],
                is_closed: false,
            };
            layer.add_line(rule_line);
        }
        y -= if b.level.is_heading() { 2.5 } else { 1.5 };
    }

    let mut buf = Vec::new();
    doc.save(&mut std::io::BufWriter::new(&mut buf))
        .map_err(|e| format!("pdf save: {e}"))?;
    Ok(buf)
}
