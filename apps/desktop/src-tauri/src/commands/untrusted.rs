//! Guards for parsing files Applye did not produce.
//!
//! Three import paths hand a third-party parser a file the user picked from
//! disk: CV import (PDF via `pdf-extract`, DOCX via `docx-rs`) and tracklist
//! import (XLSX via `calamine`). All three parse deeply structured binary
//! formats whose contents came from anywhere - an email attachment, a
//! download, a recruiter's export - so malformed input is a normal case, not
//! an exceptional one.

/// Runs an untrusted-document parser and turns a panic into an ordinary `Err`.
///
/// These crates panic on some malformed input (index out of range, unwrap on a
/// missing object) instead of returning their own error type. Without this,
/// one bad file takes the whole app down mid-import rather than showing "could
/// not read this file".
///
/// Honest limit: this catches *panics*, not every crash. A genuine stack
/// overflow aborts the process and cannot be caught in-process by any Rust
/// code; the defence there is keeping the parsers current - see `audit.toml`
/// and the `cargo audit` entry in the validation matrix - not this function.
/// `panic = "abort"` is deliberately not set for this crate, so unwinding is
/// available for the guard to work.
pub fn catch_parser_panic<T>(label: &str, parse: impl FnOnce() -> T) -> Result<T, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(parse)).map_err(|payload| {
        // The panic message is developer detail: log it, but hand the user a
        // stable sentence rather than a Rust backtrace fragment.
        let detail = payload
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic".to_string());
        eprintln!("{label}: parser panicked: {detail}");
        format!("{label}: this file could not be read - it may be corrupt or unsupported")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_a_value_through_untouched() {
        let out = catch_parser_panic("test", || 42);
        assert_eq!(out, Ok(42));
    }

    #[test]
    fn converts_a_panic_into_an_error() {
        // The panic hook would otherwise print a scary backtrace during the
        // test run; silence it just for this call.
        let prev = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));
        let out = catch_parser_panic("test", || -> i32 { panic!("index out of range") });
        std::panic::set_hook(prev);

        let err = out.expect_err("a panicking parser must not return Ok");
        assert!(err.contains("could not be read"), "got: {err}");
        // The raw panic text must not reach the user-facing message.
        assert!(!err.contains("index out of range"), "got: {err}");
    }

    #[test]
    fn carries_the_label_into_the_message() {
        let prev = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));
        let out = catch_parser_panic("read_pdf_text", || -> u8 { panic!("boom") });
        std::panic::set_hook(prev);

        assert!(out.unwrap_err().starts_with("read_pdf_text:"));
    }
}
