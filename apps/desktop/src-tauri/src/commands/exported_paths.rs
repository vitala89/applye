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
}
