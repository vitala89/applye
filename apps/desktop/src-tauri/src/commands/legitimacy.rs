// Deterministic legitimacy check (0 tokens). Pure Rust pattern matching, no AI
// call ever. Runs in the paste pipeline after the hard filter, before any
// scoring is offered. Augmentation, not a gate: even a red job can still be
// scored/tailored if the user chooses — this only informs.

/// Tunable thresholds, kept in one place so they can be retuned without
/// hunting through the trigger logic below.
pub struct LegitimacyThresholds {
    pub max_posting_age_days: i64,
    pub min_salary_low_high_ratio: f64,
}

pub const DEFAULT_THRESHOLDS: LegitimacyThresholds = LegitimacyThresholds {
    max_posting_age_days: 90,
    min_salary_low_high_ratio: 0.30,
};

const PERSONAL_EMAIL_DOMAINS: &[&str] = &["gmail.com", "hotmail.com", "yahoo.com", "outlook.com"];

const SALARY_KEYWORDS: &[&str] = &[
    "salary",
    "compensation",
    "gehalt",
    "pay range",
    "comp range",
    "remuneration",
    "base pay",
    "base salary",
    "wage",
    "ote",
    "per annum",
    "per year",
    "annual salary",
    "salary range",
    "compensation package",
];

const VAGUE_SCOPE_PHRASES: &[&str] = &["various duties as assigned", "other duties as required"];

const COMPANY_HEADER_KEYS: &[&str] = &["company", "employer", "organization", "hiring company"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LegitimacyTier {
    Green,
    Yellow,
    Red,
}

impl LegitimacyTier {
    pub fn as_str(self) -> &'static str {
        match self {
            LegitimacyTier::Green => "green",
            LegitimacyTier::Yellow => "yellow",
            LegitimacyTier::Red => "red",
        }
    }
}

/// Deterministic legitimacy check. Tier = worst triggered level (red > yellow
/// > green); each trigger appends a human-readable note. `company` and
/// `apply_email` are whatever the paste pipeline already extracted from the
/// JD — no new fields are required.
pub fn legitimacy_check(
    jd_text: &str,
    company: Option<&str>,
    apply_email: Option<&str>,
) -> (LegitimacyTier, Vec<String>) {
    let lower = jd_text.to_lowercase();
    let mut tier = LegitimacyTier::Green;
    let mut notes: Vec<String> = Vec::new();

    // --- red triggers ---

    let company_present = company.map(|c| !c.trim().is_empty()).unwrap_or(false);
    if !company_present {
        notes.push("No company name found in the posting.".to_string());
        tier = tier.max(LegitimacyTier::Red);
    } else if has_conflicting_company_mentions(jd_text) {
        notes.push("Posting mentions more than one company name — possible mismatch.".to_string());
        tier = tier.max(LegitimacyTier::Red);
    }

    if let Some(email) = apply_email {
        if let Some(domain) = email_domain(email) {
            if PERSONAL_EMAIL_DOMAINS.contains(&domain.as_str()) {
                notes.push(format!(
                    "Application directed to a personal email address ({email}) instead of a company domain."
                ));
                tier = tier.max(LegitimacyTier::Red);
            }
        }
    }

    let money = extract_money_values(jd_text);
    if money.len() >= 2 {
        let low = money.iter().cloned().fold(f64::INFINITY, f64::min);
        let high = money.iter().cloned().fold(0.0, f64::max);
        if high > 0.0 && low < high * DEFAULT_THRESHOLDS.min_salary_low_high_ratio {
            notes.push(format!(
                "Salary range looks implausibly wide ({low:.0}–{high:.0})."
            ));
            tier = tier.max(LegitimacyTier::Red);
        }
    }

    // --- yellow triggers ---

    let has_salary = !money.is_empty()
        || SALARY_KEYWORDS.iter().any(|k| lower.contains(k))
        || mentions_salary_amount(&lower);
    if !has_salary {
        notes.push("Salary is not mentioned anywhere in the posting.".to_string());
        tier = tier.max(LegitimacyTier::Yellow);
    }

    let wears_many_hats = lower.contains("wear many hats") || lower.contains("wear multiple hats");
    if wears_many_hats && !mentions_team_size(&lower) {
        notes.push("\"Wear many hats\" language with no team size mentioned.".to_string());
        tier = tier.max(LegitimacyTier::Yellow);
    }

    if VAGUE_SCOPE_PHRASES.iter().any(|p| lower.contains(p)) {
        notes.push("Vague scope language (\"other duties as assigned/required\").".to_string());
        tier = tier.max(LegitimacyTier::Yellow);
    }

    if let Some(days) = posting_age_days(jd_text) {
        if days > DEFAULT_THRESHOLDS.max_posting_age_days {
            notes.push(format!(
                "Posting is {days} days old (over the {}-day threshold).",
                DEFAULT_THRESHOLDS.max_posting_age_days
            ));
            tier = tier.max(LegitimacyTier::Yellow);
        }
    }

    (tier, notes)
}

/// Flags a scam-template repost: the same JD body (company header lines
/// stripped, whitespace/case normalized) already stored in the DB under a
/// different company. `jd_hash` excludes the current row — a re-paste of the
/// exact same text always lands in the same row already, so that case is not
/// "a different company", it's the same posting being updated.
pub async fn duplicate_jd_other_company(
    pool: &sqlx::SqlitePool,
    jd_text: &str,
    jd_hash: &str,
    company: Option<&str>,
) -> Result<bool, sqlx::Error> {
    let Some(this_company) = company
        .map(|c| c.trim().to_lowercase())
        .filter(|c| !c.is_empty())
    else {
        return Ok(false);
    };
    let this_body = normalize_body(jd_text);

    let rows: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT jd_text, company FROM jobs WHERE jd_hash != ?")
            .bind(jd_hash)
            .fetch_all(pool)
            .await?;

    Ok(rows.iter().any(|(other_text, other_company)| {
        let other_company = other_company
            .as_deref()
            .map(|c| c.trim().to_lowercase())
            .filter(|c| !c.is_empty());
        match other_company {
            Some(oc) if oc != this_company => normalize_body(other_text) == this_body,
            _ => false,
        }
    }))
}

/// JD body with company-identifying header lines stripped, then
/// whitespace/case normalized — so a scam template reposted under a
/// different company name still compares equal.
fn normalize_body(text: &str) -> String {
    text.lines()
        .filter(|line| {
            line.split_once(':')
                .map(|(key, _)| !COMPANY_HEADER_KEYS.contains(&key.trim().to_lowercase().as_str()))
                .unwrap_or(true)
        })
        .collect::<Vec<_>>()
        .join("\n")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// First plausible application email: prefers lines that read like an apply
/// instruction, falls back to the first email address anywhere in the JD.
pub fn extract_apply_email(text: &str) -> Option<String> {
    for line in text.lines() {
        let lower = line.to_lowercase();
        if lower.contains("apply")
            || lower.contains("send")
            || lower.contains("contact")
            || lower.contains("email")
            || lower.contains("resume to")
            || lower.contains("cv to")
        {
            if let Some(email) = find_email_in(line) {
                return Some(email);
            }
        }
    }
    find_email_in(text)
}

fn is_email_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '+')
}

fn find_email_in(text: &str) -> Option<String> {
    let chars: Vec<char> = text.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if c != '@' {
            continue;
        }
        let mut start = i;
        while start > 0 && is_email_char(chars[start - 1]) {
            start -= 1;
        }
        let mut end = i + 1;
        while end < chars.len() && is_email_char(chars[end]) {
            end += 1;
        }
        if start == i || end == i + 1 {
            continue;
        }
        let candidate: String = chars[start..end].iter().collect();
        let candidate = candidate.trim_matches(|c: char| c == '.' || c == ',');
        if candidate.contains('.') {
            return Some(candidate.to_string());
        }
    }
    None
}

fn email_domain(email: &str) -> Option<String> {
    email.split('@').nth(1).map(|d| d.to_lowercase())
}

fn header_company_mentions(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    for line in text.lines().take(60) {
        if let Some((key, value)) = line.split_once(':') {
            if COMPANY_HEADER_KEYS.contains(&key.trim().to_lowercase().as_str()) {
                let v = value.trim();
                if !v.is_empty() {
                    found.push(v.to_lowercase());
                }
            }
        }
    }
    found
}

fn has_conflicting_company_mentions(text: &str) -> bool {
    let mut distinct: Vec<String> = Vec::new();
    for m in header_company_mentions(text) {
        if !distinct.contains(&m) {
            distinct.push(m);
        }
    }
    distinct.len() > 1
}

fn mentions_team_size(lower: &str) -> bool {
    if lower.contains("team size") {
        return true;
    }
    if let Some(idx) = lower.find("team of ") {
        let rest = &lower[idx + "team of ".len()..];
        return rest.chars().next().is_some_and(|c| c.is_ascii_digit());
    }
    false
}

/// Currency-prefixed amounts (`€30K`, `$50,000`, `£40000`). Heuristic, not a
/// full money parser — enough to compare a salary range's low/high spread.
/// Detects a salary amount written without a leading currency symbol -
/// "80k" / "120K" shorthand, or a number sitting next to a currency code
/// (EUR / USD / GBP). Complements `extract_money_values` (symbol-prefixed) so
/// the "no salary" note does not fire on plainly-stated pay. Char-based so it
/// is safe on non-ASCII text.
fn mentions_salary_amount(lower: &str) -> bool {
    let chars: Vec<char> = lower.chars().collect();
    let n = chars.len();

    // "<2-3 digits>k" shorthand not glued to another word (e.g. 80k, 120k).
    let mut i = 0;
    while i < n {
        if chars[i].is_ascii_digit() {
            let start = i;
            while i < n && chars[i].is_ascii_digit() {
                i += 1;
            }
            let len = i - start;
            if i < n
                && chars[i] == 'k'
                && (2..=3).contains(&len)
                && (start == 0 || !chars[start - 1].is_alphanumeric())
            {
                return true;
            }
        } else {
            i += 1;
        }
    }

    // A currency code (eur/usd/gbp) with a digit within ~8 chars either side.
    const CODES: &[[char; 3]] = &[['e', 'u', 'r'], ['u', 's', 'd'], ['g', 'b', 'p']];
    for w in 0..n {
        for code in CODES {
            if w + 3 <= n
                && chars[w] == code[0]
                && chars[w + 1] == code[1]
                && chars[w + 2] == code[2]
            {
                let lo = w.saturating_sub(8);
                let hi = (w + 3 + 8).min(n);
                if chars[lo..hi].iter().any(|c| c.is_ascii_digit()) {
                    return true;
                }
            }
        }
    }
    false
}

fn extract_money_values(text: &str) -> Vec<f64> {
    let chars: Vec<char> = text.chars().collect();
    let mut values = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if !matches!(chars[i], '€' | '$' | '£') {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        while j < chars.len() && chars[j].is_whitespace() {
            j += 1;
        }
        let start = j;
        let mut digits = String::new();
        while j < chars.len() && (chars[j].is_ascii_digit() || chars[j] == ',' || chars[j] == '.') {
            if chars[j].is_ascii_digit() {
                digits.push(chars[j]);
            }
            j += 1;
        }
        if j > start && !digits.is_empty() {
            if let Ok(mut value) = digits.parse::<f64>() {
                let mut k = j;
                while k < chars.len() && chars[k].is_whitespace() {
                    k += 1;
                }
                if k < chars.len() && (chars[k] == 'k' || chars[k] == 'K') {
                    value *= 1000.0;
                }
                values.push(value);
            }
        }
        i = j.max(i + 1);
    }
    values
}

fn parse_iso_date(s: &str) -> Option<(i64, i64, i64)> {
    let s = if s.len() > 10 { &s[..10] } else { s };
    let parts: Vec<&str> = s.splitn(3, '-').collect();
    if parts.len() != 3 {
        return None;
    }
    let y = parts[0].parse::<i64>().ok()?;
    let m = parts[1].parse::<i64>().ok()?;
    let d = parts[2].parse::<i64>().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some((y, m, d))
}

fn find_posting_date(text: &str) -> Option<(i64, i64, i64)> {
    for line in text.lines().take(60) {
        let lower = line.to_lowercase();
        if lower.starts_with("posted:")
            || lower.starts_with("posting date:")
            || lower.starts_with("date posted:")
            || lower.starts_with("published:")
        {
            if let Some((_, value)) = line.split_once(':') {
                if let Some(date) = parse_iso_date(value.trim()) {
                    return Some(date);
                }
            }
        }
    }
    None
}

/// Days since the Unix epoch for a civil (y, m, d) date — Howard Hinnant's
/// `days_from_civil`. Dependency-free so we don't need a date crate just for
/// "is this posting over 90 days old".
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn posting_age_days(text: &str) -> Option<i64> {
    let (y, m, d) = find_posting_date(text)?;
    let posted_days = days_from_civil(y, m, d);
    let now_days = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs() as i64
        / 86400;
    Some(now_days - posted_days)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn salary_shorthand_and_codes_count_as_mentioned() {
        assert!(mentions_salary_amount("80k - 120k depending on experience"));
        assert!(mentions_salary_amount("base range 90,000 eur per year"));
        assert!(mentions_salary_amount("we pay 120000 usd annually"));
        // no amount, no code -> not a salary signal
        assert!(!mentions_salary_amount("we offer a competitive package"));
        // bare "usd"/"k" with no nearby number must not false-positive
        assert!(!mentions_salary_amount(
            "talks about usd markets in general"
        ));
        assert!(!mentions_salary_amount("work in a task-heavy role"));
    }

    #[test]
    fn no_salary_note_suppressed_when_shorthand_present() {
        let jd = "Company: Acme\nBackend Engineer. Pay is 90k-120k. Great team.";
        let (_, notes) = legitimacy_check(jd, Some("Acme"), None);
        assert!(!notes.iter().any(|n| n.contains("Salary is not mentioned")));
    }

    #[test]
    fn green_when_clean() {
        let jd = "Company: Acme Robotics\n\
                   Title: Senior Backend Engineer\n\
                   Salary: €90,000 - €110,000\n\
                   We are a 40-person team building warehouse robots.\n\
                   Apply: jobs@acmerobotics.com";
        let (tier, notes) =
            legitimacy_check(jd, Some("Acme Robotics"), Some("jobs@acmerobotics.com"));
        assert_eq!(tier, LegitimacyTier::Green);
        assert!(notes.is_empty());
    }

    #[test]
    fn yellow_no_salary() {
        let jd = "Company: Acme Robotics\nWe build great products.";
        let (tier, notes) = legitimacy_check(jd, Some("Acme Robotics"), None);
        assert_eq!(tier, LegitimacyTier::Yellow);
        assert!(notes.iter().any(|n| n.contains("Salary")));
    }

    #[test]
    fn yellow_wear_many_hats_without_team_size() {
        let jd = "Company: Acme Robotics\nSalary: €80,000\n\
                   You'll wear many hats in this fast-paced startup.";
        let (tier, notes) = legitimacy_check(jd, Some("Acme Robotics"), None);
        assert_eq!(tier, LegitimacyTier::Yellow);
        assert!(notes.iter().any(|n| n.contains("hats")));
    }

    #[test]
    fn wear_many_hats_with_team_size_does_not_flag() {
        let jd = "Company: Acme Robotics\nSalary: €80,000\n\
                   You'll wear many hats on our team of 8 engineers.";
        let (tier, notes) = legitimacy_check(jd, Some("Acme Robotics"), None);
        assert_eq!(tier, LegitimacyTier::Green);
        assert!(notes.is_empty());
    }

    #[test]
    fn yellow_posting_age_over_90_days() {
        let jd = "Company: Acme Robotics\nSalary: €80,000\nPosted: 2020-01-01";
        let (tier, notes) = legitimacy_check(jd, Some("Acme Robotics"), None);
        assert_eq!(tier, LegitimacyTier::Yellow);
        assert!(notes.iter().any(|n| n.contains("days old")));
    }

    #[test]
    fn yellow_vague_scope_language() {
        let jd = "Company: Acme Robotics\nSalary: €80,000\n\
                   Performs various duties as assigned by management.";
        let (tier, notes) = legitimacy_check(jd, Some("Acme Robotics"), None);
        assert_eq!(tier, LegitimacyTier::Yellow);
        assert!(notes.iter().any(|n| n.contains("Vague scope")));
    }

    #[test]
    fn red_no_company_name() {
        let jd = "Salary: €80,000\nGreat opportunity for a backend engineer.";
        let (tier, notes) = legitimacy_check(jd, None, None);
        assert_eq!(tier, LegitimacyTier::Red);
        assert!(notes.iter().any(|n| n.contains("No company name")));
    }

    #[test]
    fn red_conflicting_company_mentions() {
        let jd = "Company: Acme Robotics\nSalary: €80,000\nEmployer: Globex Corp";
        let (tier, notes) = legitimacy_check(jd, Some("Acme Robotics"), None);
        assert_eq!(tier, LegitimacyTier::Red);
        assert!(notes.iter().any(|n| n.contains("more than one company")));
    }

    #[test]
    fn red_personal_email_domain() {
        let jd = "Company: Acme Robotics\nSalary: €80,000\nApply: send your CV to recruiter123@gmail.com";
        let (tier, notes) =
            legitimacy_check(jd, Some("Acme Robotics"), Some("recruiter123@gmail.com"));
        assert_eq!(tier, LegitimacyTier::Red);
        assert!(notes.iter().any(|n| n.contains("personal email")));
    }

    #[test]
    fn company_email_domain_does_not_flag() {
        let jd = "Company: Acme Robotics\nSalary: €80,000";
        let (tier, notes) =
            legitimacy_check(jd, Some("Acme Robotics"), Some("jobs@acmerobotics.com"));
        assert_eq!(tier, LegitimacyTier::Green);
        assert!(notes.is_empty());
    }

    #[test]
    fn red_impossibly_wide_salary_range() {
        let jd = "Company: Acme Robotics\nSalary: €30K – €200K";
        let (tier, notes) = legitimacy_check(jd, Some("Acme Robotics"), None);
        assert_eq!(tier, LegitimacyTier::Red);
        assert!(notes.iter().any(|n| n.contains("implausibly wide")));
    }

    #[test]
    fn reasonable_salary_range_does_not_flag() {
        let jd = "Company: Acme Robotics\nSalary: €90K – €110K";
        let (tier, notes) = legitimacy_check(jd, Some("Acme Robotics"), None);
        assert_eq!(tier, LegitimacyTier::Green);
        assert!(notes.is_empty());
    }

    #[test]
    fn tier_is_worst_of_multiple_triggers() {
        // No company (red) + no salary (yellow) -> tier must be red, both notes present.
        let jd = "We are hiring a backend engineer. Various duties as assigned.";
        let (tier, notes) = legitimacy_check(jd, None, None);
        assert_eq!(tier, LegitimacyTier::Red);
        assert!(notes.len() >= 3);
        assert!(notes.iter().any(|n| n.contains("No company name")));
        assert!(notes.iter().any(|n| n.contains("Salary")));
        assert!(notes.iter().any(|n| n.contains("Vague scope")));
    }

    #[test]
    fn extracts_apply_email_from_keyword_line() {
        let text = "Some intro.\nApply by emailing jobs@acmerobotics.com with your CV.";
        assert_eq!(
            extract_apply_email(text),
            Some("jobs@acmerobotics.com".to_string())
        );
    }

    #[test]
    fn normalize_body_strips_company_lines_and_case() {
        let a = "Company: Acme Robotics\nBuild great robots.\nReport to the CTO.";
        let b = "Company: Globex Corp\nBUILD GREAT ROBOTS.\nReport   to the CTO.";
        assert_eq!(normalize_body(a), normalize_body(b));
    }

    #[test]
    fn extracts_apply_email_fallback_first_email() {
        let text = "Reach out to hr@acmerobotics.com for questions.";
        assert_eq!(
            extract_apply_email(text),
            Some("hr@acmerobotics.com".to_string())
        );
    }
}
