// DOCX rendering. The mirror of `tailoring_pdf`: same resolved blocks in, a
// different format out. Split out of `tailoring.rs`, which was 2087 lines
// against an 800 budget and held both renderers plus the block model they
// share.
//
// The model, the theme and the style resolution stay in `tailoring` - both
// renderers read them, so neither owns them. What lives here is everything
// specific to the Office Open XML side: paragraph construction, the page
// section, and the font-embedding pass that makes a Lato CV render as Lato in
// Word instead of silently substituting.

use super::tailoring::*;
use super::tailoring_fonts::{FONT_LATO_B, FONT_LATO_R, FONT_OPENSANS_B, FONT_OPENSANS_R};
use super::tailoring_markdown::{md_to_blocks, parse_inline_runs};
use crate::commands::documents_style::CvStyle;

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

#[cfg(test)]
mod tests {
    use super::super::tailoring::tests::sb;
    use super::*;
    use crate::commands::documents_style::{CvStyle, PhotoPlacement};
    use crate::commands::tailoring_theme::builtin_theme;

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
}
