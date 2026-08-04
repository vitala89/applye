// Reading the shape of a pasted URL: host, path segments, and a display name
// derived from a slug.
//
// String-level on purpose - the from-link flow classifies a URL before anything
// is fetched, so this must never allocate a client or follow a redirect. The
// host is what the allowlist in `job_url.rs` matches against, which is why the
// port, the userinfo and the case are stripped here rather than at each caller.

pub(crate) fn extract_host(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let without_scheme = trimmed.split("://").nth(1).unwrap_or(trimmed);
    let host_and_rest = without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(without_scheme);
    let host = host_and_rest.rsplit('@').next().unwrap_or(host_and_rest);
    let host = host.split(':').next().unwrap_or(host);
    let host = host.trim().to_lowercase();
    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

pub(crate) fn path_segments(url: &str) -> Vec<String> {
    let without_scheme = url.split("://").nth(1).unwrap_or(url);
    let without_query = without_scheme
        .split(['?', '#'])
        .next()
        .unwrap_or(without_scheme);
    without_query
        .split_once('/')
        .map(|(_, rest)| rest)
        .unwrap_or("")
        .split('/')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

pub(crate) fn titleize_slug(slug: &str) -> String {
    slug.split(['-', '_'])
        .filter(|s| !s.is_empty())
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The allowlist compares against this string, so anything that could make
    /// a closed board read as an allowed host has to be removed here: a port, a
    /// `user@` prefix, surrounding space, and upper case.
    #[test]
    fn extracts_the_bare_lowercase_host() {
        assert_eq!(
            extract_host("https://Boards-API.greenhouse.io/v1/boards/acme").as_deref(),
            Some("boards-api.greenhouse.io")
        );
        assert_eq!(
            extract_host("  https://user@api.lever.co:8443/v0/postings/acme  ").as_deref(),
            Some("api.lever.co")
        );
        assert_eq!(
            extract_host("remotive.com/remote-jobs/1").as_deref(),
            Some("remotive.com")
        );
    }

    #[test]
    fn reports_no_host_when_there_is_none() {
        assert_eq!(extract_host(""), None);
        assert_eq!(extract_host("https:///jobs/1"), None);
    }

    #[test]
    fn splits_the_path_and_drops_the_query() {
        assert_eq!(
            path_segments("https://boards-api.greenhouse.io/v1/boards/acme/jobs/123?utm=x"),
            vec!["v1", "boards", "acme", "jobs", "123"]
        );
        assert_eq!(
            path_segments("https://acme.jobs.personio.de/job/12345#apply"),
            vec!["job", "12345"]
        );
        assert!(path_segments("https://remotive.com").is_empty());
        assert!(path_segments("https://remotive.com/").is_empty());
    }

    /// Used as the company name when a board exposes only its slug.
    #[test]
    fn titleizes_a_board_slug() {
        assert_eq!(titleize_slug("acme-corp"), "Acme Corp");
        assert_eq!(titleize_slug("acme_corp--gmbh"), "Acme Corp Gmbh");
        assert_eq!(titleize_slug(""), "");
    }
}
