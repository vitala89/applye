// Inline `**bold**` spans for the live DOCX renderer. The journal markdown
// reader left with the dormant generated-document export commands.

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
}
