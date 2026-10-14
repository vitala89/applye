// Turning public web payloads into plain text.
//
// The from-link paste flow and the Discover feed readers both receive job
// descriptions as HTML fragments or XML/RSS bodies. These helpers are the one
// place that decides what counts as markup and how a tag becomes a line break,
// so both callers strip the same way. Nothing here fetches or classifies -
// `job_url.rs` owns the allowlist, `discover_fetch.rs` owns the transport.

/// How many strip/decode rounds `strip_html` will run. Two is enough for every
/// payload observed: raw markup, markup escaped once, and markup escaped once
/// whose own entities were escaped with it. The cap is what stops a crafted
/// payload of nested `&amp;amp;lt;` from costing a round per layer.
const MAX_UNESCAPE_ROUNDS: usize = 3;

/// Decode the entity subset these feeds actually emit. Ampersand is decoded
/// LAST: doing it first would turn `&amp;lt;` into `&lt;` and then into `<`
/// inside the same pass, collapsing two layers at once and inventing markup the
/// source never wrote.
fn decode_entities(input: &str) -> String {
    input
        .replace("&nbsp;", " ")
        .replace("&#39;", "'")
        .replace("&quot;", "\"")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

/// True if the text still holds something shaped like a tag. Must accept the
/// same openers `strip_tags_once` does, or a round would decline to strip
/// something the next pass would have removed. Prose like "up to 5 < 10" is
/// left alone, which is the whole point of requiring a name after the `<`.
fn looks_like_markup(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.iter().enumerate().any(|(i, &b)| {
        b == b'<'
            && matches!(bytes.get(i + 1), Some(c) if c.is_ascii_alphabetic() || *c == b'/' || *c == b'!')
    })
}

/// Strip HTML tags to plain text (no external crate - the ATS payloads are
/// small, well-formed job descriptions, not arbitrary web pages).
///
/// Strips and decodes in a loop rather than once, because feeds disagree about
/// how many times they escape their own markup. ArbeitNow serves descriptions
/// with the tags entity-escaped (`&lt;p&gt;`) while their inner entities are
/// escaped along with them (`&amp;nbsp;`). A single pass that stripped first and
/// decoded afterwards did the worst possible thing with that: it removed no
/// tags, then turned every escaped tag INTO visible `<p>` text, which is how a
/// job description ended up rendering as its own source.
///
/// So each round strips whatever reads as a tag, decodes entities, and stops as
/// soon as a round reveals no further markup - bounded by
/// `MAX_UNESCAPE_ROUNDS`. Text is only ever removed when it looks like a tag
/// both before and after decoding, so prose containing a bare `<` survives.
pub(crate) fn strip_html(input: &str) -> String {
    let mut text = strip_tags_once(input);
    for _ in 0..MAX_UNESCAPE_ROUNDS {
        let decoded = decode_entities(&text);
        if !looks_like_markup(&decoded) {
            text = decoded;
            break;
        }
        text = strip_tags_once(&decoded);
    }

    // Collapse runs of blank lines down to a single blank line (paragraph break).
    let mut cleaned: Vec<&str> = Vec::new();
    for line in text.lines().map(|l| l.trim()) {
        if line.is_empty() && cleaned.last().map(|l: &&str| l.is_empty()).unwrap_or(true) {
            continue;
        }
        cleaned.push(line);
    }
    cleaned.join("\n").trim().to_string()
}

/// One pass of tag removal. Block-level tags become a newline so the paragraph
/// structure of the description survives into the plain text.
///
/// A `<` only opens a tag when a name, a closing slash or a `!` follows it.
/// Treating every `<` as a tag start cost real text: a description reading
/// "latency < 100 ms in prod" has no closing `>`, so the rest of the line was
/// swallowed - silently, and into the text the AI is then asked to score.
fn strip_tags_once(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    let mut tag_buf = String::new();
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '<' if !in_tag
                && matches!(chars.peek(), Some(n) if n.is_ascii_alphabetic() || *n == '/' || *n == '!') =>
            {
                in_tag = true;
                tag_buf.clear();
            }
            '>' if in_tag => {
                in_tag = false;
                let name = tag_buf
                    .trim_start_matches('/')
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .to_lowercase();
                if matches!(
                    name.as_str(),
                    "p" | "div"
                        | "li"
                        | "ul"
                        | "ol"
                        | "br"
                        | "h1"
                        | "h2"
                        | "h3"
                        | "h4"
                        | "h5"
                        | "h6"
                        | "tr"
                        | "table"
                ) {
                    out.push('\n');
                }
            }
            _ if in_tag => tag_buf.push(c),
            _ => out.push(c),
        }
    }
    out
}

pub(crate) fn xml_tag(block: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = block.find(&open)? + open.len();
    let rest = &block[start..];
    let end = rest.find(&close)?;
    let raw = &rest[..end];
    let decoded = raw
        .replace("<![CDATA[", "")
        .replace("]]>", "")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
        .replace("&quot;", "\"");
    let trimmed = decoded.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- strip_html -------------------------------------------------------------
    //
    // Reported from the app: a Discover job description rendered as its own
    // source - visible `<p>`, `<li>`, `&amp;` and `&nbsp;`. ArbeitNow serves the
    // description with its tags entity-escaped and the entities inside them
    // escaped along with them, and the old single pass stripped tags BEFORE
    // decoding, so it removed nothing and then turned every escaped tag into
    // literal text.

    #[test]
    fn strips_plain_markup() {
        assert_eq!(strip_html("<p>Build things.</p>"), "Build things.");
    }

    #[test]
    fn strips_markup_that_arrived_entity_escaped() {
        assert_eq!(
            strip_html("&lt;p&gt;Build things.&lt;/p&gt;"),
            "Build things."
        );
    }

    /// The exact shape from the report: escaped tags whose own entities were
    /// escaped with them. Nothing tag-shaped and no raw entity may survive.
    #[test]
    fn strips_arbeitnow_double_escaped_description() {
        let raw = "&lt;p&gt;Datadog&amp;#39;s Channels &amp;amp; Alliances.&lt;/p&gt; \
                   &lt;p&gt;&amp;nbsp;&lt;/p&gt; &lt;ul&gt;&lt;li&gt;Public Cloud&lt;/li&gt;&lt;/ul&gt;";
        let out = strip_html(raw);
        assert!(!out.contains('<'), "tag text survived: {out}");
        assert!(!out.contains("&amp;"), "entity survived: {out}");
        assert!(!out.contains("&nbsp;"), "entity survived: {out}");
        assert!(out.contains("Channels & Alliances"));
        assert!(out.contains("Datadog's"));
        assert!(out.contains("Public Cloud"));
    }

    /// A bare `<` in prose is not markup and must not eat the rest of the line.
    #[test]
    fn keeps_a_bare_less_than_in_prose() {
        assert_eq!(
            strip_html("latency < 100 ms in prod"),
            "latency < 100 ms in prod"
        );
    }

    /// Escaping the ampersand of an entity is a real layer and must not be
    /// collapsed in one pass: `&amp;amp;` is the text "&amp;", not "&".
    #[test]
    fn decodes_one_escaping_layer_per_round() {
        assert_eq!(strip_html("A &amp;amp; B"), "A &amp; B");
    }

    /// Both the open and the close of a block tag emit a break, so paragraphs
    /// stay separated by a blank line after the run-collapsing step.
    #[test]
    fn block_tags_become_paragraph_breaks() {
        let out = strip_html("<p>One</p><p>Two</p><ul><li>Three</li></ul>");
        assert_eq!(out, "One\n\nTwo\n\nThree");
    }

    #[test]
    fn deeply_nested_escaping_terminates_without_hanging() {
        let raw = "&amp;amp;amp;amp;lt;p&amp;amp;amp;amp;gt;Deep";
        let out = strip_html(raw);
        assert!(out.contains("Deep"));
    }

    #[test]
    fn strips_html_and_decodes_entities() {
        let out = strip_html("<p>Hello &amp; welcome</p><ul><li>One</li></ul>");
        assert_eq!(out, "Hello & welcome\n\nOne");
    }

    #[test]
    fn parses_real_personio_position_block() {
        let block = r#"<id>2415353</id> <subcompany>CLARK Holding SE</subcompany> <office>Berlin</office> <name>(Senior) CRM Manager (m/w/d)</name> <jobDescriptions><jobDescription>
            <name>Wer wir sind</name>
            <value>
                <![CDATA[<span>Als eines von Europas InsurTechs<br>zweite Zeile</span>]]>
            </value>
        </jobDescription></jobDescriptions>"#;
        assert_eq!(xml_tag(block, "id").as_deref(), Some("2415353"));
        assert_eq!(
            xml_tag(block, "subcompany").as_deref(),
            Some("CLARK Holding SE")
        );
        assert_eq!(
            xml_tag(block, "name").as_deref(),
            Some("(Senior) CRM Manager (m/w/d)")
        );
        let section = block
            .split("<jobDescription>")
            .nth(1)
            .unwrap()
            .split("</jobDescription>")
            .next()
            .unwrap();
        assert!(xml_tag(section, "value")
            .unwrap()
            .contains("Als eines von Europas InsurTechs"));
    }
}
