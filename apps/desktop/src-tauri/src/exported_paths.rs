// The set of files Applye has written outside its own data directory during
// this run, and the rule for what is allowed to join it.
//
// `open_file` and `reveal_in_folder` hand a path to the OS launcher, so they
// have always been guarded. The guard was "must live under `app_data_dir`",
// which was true of the journal exports it was written for and is not true of
// the apply wizard's Export PDF: that one writes wherever the save dialog
// pointed, which is usually Downloads. The result was that Applye refused to
// open the file it had just written and told the user it was "outside Applye's
// own document folder", which reads as nonsense next to the path it had just
// printed.
//
// Widening the guard to the user's folders would trade the whole threat model
// for convenience: the point of it is that a bug or a compromised renderer
// cannot ask the backend to launch an arbitrary file on disk. So instead of
// widening it by location, this narrows it by provenance - a path is openable
// because **Applye wrote it**, not because of where it sits.
//
// Two limits keep that from being a loophole. The export commands are
// themselves callable by the renderer, so a compromised one could ask for a
// write to any path it likes and then ask to open it; that is why only the
// extensions Applye actually exports are ever remembered, which keeps the
// launcher on documents rather than on anything the OS would execute. And the
// set lives in memory only: it is what this run wrote, not a growing record of
// everywhere the user has ever saved.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Extensions Applye exports. A path with any other extension is never
/// remembered, so the launcher can only ever be pointed at a document - never
/// at a `.command`, `.sh`, `.app` or anything else the OS would run.
const EXPORTABLE: [&str; 2] = ["pdf", "docx"];

/// Paths this run has written, canonicalized. Tauri-managed state.
#[derive(Default)]
pub struct ExportedPaths(Mutex<HashSet<PathBuf>>);

impl ExportedPaths {
    /// Records a file Applye just wrote, if it is one of the document formats
    /// Applye exports. Canonicalizes first, so the later lookup compares
    /// resolved paths and a `..` or a symlink cannot be used to smuggle a
    /// different file past a matching string.
    ///
    /// Silent when the path cannot be canonicalized or is not exportable:
    /// remembering is a convenience for the open button, never part of whether
    /// the export itself succeeded.
    pub fn remember(&self, path: &Path) {
        if !is_exportable(path) {
            return;
        }
        let Ok(resolved) = path.canonicalize() else {
            return;
        };
        if let Ok(mut set) = self.0.lock() {
            set.insert(resolved);
        }
    }

    /// Whether `resolved` - already canonicalized by the caller - is one of the
    /// files this run wrote.
    pub fn contains(&self, resolved: &Path) -> bool {
        self.0
            .lock()
            .map(|set| set.contains(resolved))
            .unwrap_or(false)
    }
}

/// True when the path ends in an extension Applye exports, compared without
/// regard to case because Windows and macOS both hand back `.PDF` as readily
/// as `.pdf`.
fn is_exportable(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .is_some_and(|ext| EXPORTABLE.contains(&ext.as_str()))
}

/// A path the shell may hand to the OS launcher.
///
/// It qualifies in one of two ways: it sits under the app data directory, or
/// Applye wrote it during this run. `canonicalize` resolves `..` and follows
/// symlinks, so a link inside the data directory that points outside fails
/// the prefix test.
pub(crate) fn resolve_openable(
    app_data: &std::path::Path,
    exported: &ExportedPaths,
    path: &str,
) -> Result<std::path::PathBuf, String> {
    match resolve_within(app_data, path) {
        Ok(inside) => Ok(inside),
        Err(outside) => resolve_exported(exported, path).map_err(|_| outside),
    }
}

/// The provenance half of the rule: a file Applye wrote during this run.
fn resolve_exported(exported: &ExportedPaths, path: &str) -> Result<std::path::PathBuf, String> {
    let target = std::path::Path::new(path)
        .canonicalize()
        .map_err(|e| format!("no such file: {e}"))?;
    if !target.is_file() {
        return Err("refused: not a regular file".to_string());
    }
    if !exported.contains(&target) {
        return Err("refused: that file is outside Applye's own document folder".to_string());
    }
    Ok(target)
}

/// The containment rule on its own, so it can be tested without an `AppHandle`.
fn resolve_within(base: &std::path::Path, path: &str) -> Result<std::path::PathBuf, String> {
    let base = base
        .canonicalize()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let target = std::path::Path::new(path)
        .canonicalize()
        .map_err(|e| format!("no such file: {e}"))?;
    if !target.starts_with(&base) {
        return Err("refused: that file is outside Applye's own document folder".to_string());
    }
    if !target.is_file() {
        return Err("refused: not a regular file".to_string());
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("applye-exported-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, b"%PDF-1.4").unwrap();
        path
    }

    #[test]
    fn remembers_an_exported_document_and_recognises_it_again() {
        let dir = fixture_dir();
        let path = write(&dir, "remembered-cv.pdf");
        let paths = ExportedPaths::default();

        assert!(!paths.contains(&path.canonicalize().unwrap()));
        paths.remember(&path);
        assert!(paths.contains(&path.canonicalize().unwrap()));
    }

    /// The export commands are callable by the renderer, so the extension is
    /// what stops a write-then-open from pointing the OS launcher at something
    /// it would execute rather than display.
    #[test]
    fn never_remembers_a_path_the_os_would_execute() {
        let dir = fixture_dir();
        let paths = ExportedPaths::default();

        for name in ["payload.command", "payload.sh", "payload", "payload.pdf.sh"] {
            let path = write(&dir, name);
            paths.remember(&path);
            assert!(
                !paths.contains(&path.canonicalize().unwrap()),
                "{name} must not be remembered"
            );
        }
    }

    #[test]
    fn remembers_both_exported_formats_whatever_the_case() {
        let dir = fixture_dir();
        let paths = ExportedPaths::default();

        for name in ["letter.docx", "letter.DOCX", "cv.PDF"] {
            let path = write(&dir, name);
            paths.remember(&path);
            assert!(
                paths.contains(&path.canonicalize().unwrap()),
                "{name} must be remembered"
            );
        }
    }

    /// Two spellings of one file must not read as two different files, which
    /// is what canonicalizing on the way in buys.
    #[test]
    fn recognises_a_remembered_file_reached_by_a_different_spelling() {
        let dir = fixture_dir();
        let path = write(&dir, "roundabout-cv.pdf");
        let paths = ExportedPaths::default();
        paths.remember(&path);

        let roundabout = dir.join("..").join(dir.file_name().unwrap()).join(
            path.file_name()
                .expect("fixture always has a file name")
                .to_str()
                .expect("fixture name is utf-8"),
        );
        assert!(paths.contains(&roundabout.canonicalize().unwrap()));
    }

    #[test]
    fn a_file_that_does_not_exist_is_not_remembered() {
        let dir = fixture_dir();
        let paths = ExportedPaths::default();
        paths.remember(&dir.join("never-written.pdf"));
        assert!(!paths.contains(&dir.join("never-written.pdf")));
    }

    /// A scratch "app data dir" with one export inside it, plus a sibling
    /// directory standing in for the rest of the disk.
    fn containment_fixture() -> (std::path::PathBuf, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("applye-contain-{}", std::process::id()));
        let inside = root.join("app-data").join("companies").join("acme");
        let outside = root.join("elsewhere");
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(inside.join("cv.pdf"), b"%PDF-1.4").unwrap();
        std::fs::write(outside.join("payload.sh"), b"#!/bin/sh\n").unwrap();
        (root.join("app-data"), outside)
    }

    /// The reported bug: the apply wizard writes wherever the save dialog
    /// pointed - Downloads, in the report - and "Open file" then refused the
    /// file Applye had itself just written, saying it was "outside Applye's own
    /// document folder" directly beneath the path it had printed.
    #[test]
    fn allows_a_file_this_run_exported_outside_the_data_dir() {
        let (_, outside) = containment_fixture();
        let export = outside.join("tailored cv.pdf");
        std::fs::write(&export, b"%PDF-1.4").unwrap();
        let exported = ExportedPaths::default();

        let refused = resolve_exported(&exported, export.to_str().unwrap());
        assert!(refused.is_err(), "not written by us yet: {refused:?}");

        exported.remember(&export);
        let allowed = resolve_exported(&exported, export.to_str().unwrap());
        assert!(allowed.is_ok(), "got: {allowed:?}");
    }

    /// Provenance is the whole rule. Sitting next to a file we did write earns
    /// nothing, or the guard would be a directory allowance in disguise.
    #[test]
    fn refuses_a_neighbour_of_a_file_we_exported() {
        let (_, outside) = containment_fixture();
        let export = outside.join("tailored cv.pdf");
        std::fs::write(&export, b"%PDF-1.4").unwrap();
        let exported = ExportedPaths::default();
        exported.remember(&export);

        let neighbour = outside.join("payload.sh");
        let out = resolve_exported(&exported, neighbour.to_str().unwrap());
        assert!(out.is_err(), "got: {out:?}");
    }

    /// The export commands are callable by the renderer, so a compromised one
    /// could ask for a write to any path and then ask to open it. Only the
    /// extensions Applye exports are ever remembered, which keeps the OS
    /// launcher on documents rather than on anything it would run.
    #[test]
    fn refuses_an_executable_extension_even_after_writing_it() {
        let (_, outside) = containment_fixture();
        let script = outside.join("payload.command");
        std::fs::write(&script, b"#!/bin/sh\n").unwrap();
        let exported = ExportedPaths::default();

        exported.remember(&script);

        let out = resolve_exported(&exported, script.to_str().unwrap());
        assert!(out.is_err(), "got: {out:?}");
    }

    #[test]
    fn allows_a_file_inside_the_app_data_dir() {
        let (base, _) = containment_fixture();
        let target = base.join("companies").join("acme").join("cv.pdf");
        let out = resolve_within(&base, target.to_str().unwrap());
        assert!(out.is_ok(), "got: {out:?}");
    }

    #[test]
    fn refuses_a_file_outside_the_app_data_dir() {
        let (base, outside) = containment_fixture();
        let target = outside.join("payload.sh");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("a path outside the data dir must be refused");
        assert!(err.contains("outside"), "got: {err}");
    }

    #[test]
    fn refuses_a_traversal_that_climbs_out() {
        let (base, _) = containment_fixture();
        // Syntactically "inside", but `..` walks it back out to the sibling.
        let target = base.join("companies/../../elsewhere/payload.sh");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("`..` must not escape the data dir");
        assert!(err.contains("outside"), "got: {err}");
    }

    #[test]
    fn refuses_a_directory() {
        let (base, _) = containment_fixture();
        let target = base.join("companies").join("acme");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("a directory is not an exported document");
        assert!(err.contains("not a regular file"), "got: {err}");
    }

    #[test]
    fn refuses_a_path_that_does_not_exist() {
        let (base, _) = containment_fixture();
        let target = base.join("companies").join("acme").join("missing.pdf");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("a missing file must not be launched");
        assert!(err.contains("no such file"), "got: {err}");
    }
}
