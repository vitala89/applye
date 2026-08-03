// The markdown reader: tailored-CV markdown in, an untagged block list out.
// Split out of `tailoring.rs`, which was 956 lines against an 800 budget and
// held this next to the resolver that styles an already-built block list.
//
// This is the journal export path, which has no per-section style: every block
// it produces carries no section key, so the resolver gives them all the
// document-wide style. Inline `**bold**` spans are read here too, because the
// same text splitting serves both renderers.

use super::tailoring::{BlockLevel, StyledBlock};

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
mod tests {
    use super::*;

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
}
