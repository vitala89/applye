// Silent WYSIWYG PDF export (ROADMAP: single-engine exports).
//
// The editor is HTML/CSS rendered by the system WebView; any hand-written PDF
// renderer inevitably drifts from it (fonts, wrapping, spacing — two layout
// engines never agree). This module removes the second engine for PDF: a
// HIDDEN window loads the document's dedicated print route (`print/cv/:id` or
// `print/cover-letter/:id`, each rendering the same preview component as its
// editor), and once the frontend signals readiness we drive the OS print
// machinery straight to a file — no print panel, no visible window. The output
// is the editor's own render, so every current and future theme exports
// correctly with zero per-theme export code.
//
// Platform notes:
// - macOS: WKWebView `printOperationWithPrintInfo:` with `NSPrintSaveJob`
//   disposition (the exact call wry's dialog print uses, minus the panel).
// - Other platforms: falls back to the structured Rust renderer
//   (`cv_document_export_bytes_core`) until their native print-to-file calls
//   (WebView2 `PrintToPdf`, webkit2gtk print-to-file) are wired up.

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::db::Db;

/// One-shot "the print route finished rendering" signals, keyed by the hidden
/// window's label. The export command parks on the receiver; the frontend's
/// `print_window_ready` invoke fires the sender.
#[derive(Default)]
pub struct PrintReady(pub Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>);

/// Called by the print route once fonts are loaded and the paginated preview
/// has settled — the signal that the DOM is safe to snapshot.
#[tauri::command]
pub fn print_window_ready(window: tauri::WebviewWindow, state: State<'_, PrintReady>) {
    if let Some(tx) = state.0.lock().unwrap().remove(window.label()) {
        let _ = tx.send(());
    }
}

/// Exports a library CV to `save_path` as PDF by printing the live preview DOM
/// of a hidden window — pixel-identical to the editor. Silent: no dialogs, no
/// visible windows.
#[tauri::command]
pub async fn cv_document_export_pdf_wysiwyg(
    id: i64,
    save_path: String,
    app: AppHandle,
    db: State<'_, Db>,
    ready: State<'_, PrintReady>,
) -> Result<String, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&app, &ready); // silence unused warnings on the fallback path
        let bytes =
            crate::commands::documents::cv_document_export_bytes_core(id, "pdf", &db.pool).await?;
        std::fs::write(&save_path, bytes).map_err(|e| format!("export pdf: write: {e}"))?;
        Ok(save_path)
    }

    #[cfg(target_os = "macos")]
    {
        export_pdf_wysiwyg_core(id, "cv", save_path, app, db, ready).await
    }
}

/// Exports a library cover letter to `save_path` as PDF via the same hidden-
/// window print path as the CV — the letter's own `print/cover-letter/:id`
/// route renders `<app-cover-letter-preview>`, the editor's own render.
#[tauri::command]
pub async fn cover_letter_document_export_pdf_wysiwyg(
    id: i64,
    save_path: String,
    app: AppHandle,
    db: State<'_, Db>,
    ready: State<'_, PrintReady>,
) -> Result<String, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&app, &ready); // silence unused warnings on the fallback path
        let bytes = crate::commands::documents::cover_letter_document_export_bytes_core(
            id, "pdf", &db.pool,
        )
        .await?;
        std::fs::write(&save_path, bytes).map_err(|e| format!("export pdf: write: {e}"))?;
        Ok(save_path)
    }

    #[cfg(target_os = "macos")]
    {
        export_pdf_wysiwyg_core(id, "cover-letter", save_path, app, db, ready).await
    }
}

/// The shared silent-export machinery behind both document types: spin up an
/// off-screen window on the given print route, wait for it to signal ready,
/// then drive the native print straight to a PDF file. `route_kind` is the
/// `print/<kind>/:id` segment — the ONLY thing that differs per document type,
/// because both routes render their editor's preview component.
#[cfg(target_os = "macos")]
async fn export_pdf_wysiwyg_core(
    id: i64,
    route_kind: &str,
    save_path: String,
    app: AppHandle,
    db: State<'_, Db>,
    ready: State<'_, PrintReady>,
) -> Result<String, String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    {
        // Page geometry from the document's style — the print box the preview
        // laid itself out for.
        let doc = crate::commands::documents::document_library_get_core(id, &db.pool)
            .await?
            .ok_or_else(|| "document_export: document not found".to_string())?;
        let page_settings: crate::commands::documents::PageSettings = doc
            .style_json
            .as_deref()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .and_then(|v| v.get("page").cloned())
            .and_then(|p| serde_json::from_value(p).ok())
            .unwrap_or_default();
        let page = crate::commands::tailoring::resolve_page(&page_settings);

        // Unique label per export so parallel/repeated exports never collide.
        let label = format!(
            "{route_kind}-print-{id}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.subsec_nanos())
                .unwrap_or(0)
        );
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        ready.0.lock().unwrap().insert(label.clone(), tx);

        // WebKit suspends rendering (and rAF) for `visible(false)` windows, so
        // the print route would never paint or signal ready. Keep it VISIBLE but
        // parked far off-screen and undecorated — it renders normally, the user
        // never sees it, and it's gone in well under a second.
        let win = WebviewWindowBuilder::new(
            &app,
            &label,
            WebviewUrl::App(format!("print/{route_kind}/{id}").into()),
        )
        .title("Export PDF")
        .inner_size(1000.0, 1400.0)
        .position(-10000.0, -10000.0)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .build()
        .map_err(|e| format!("print window: {e}"))?;

        // Wait for the route to render (fonts + pagination settled).
        let waited = tokio::time::timeout(std::time::Duration::from_secs(20), rx).await;
        if waited.is_err() {
            ready.0.lock().unwrap().remove(&label);
            let _ = win.close();
            return Err("print window timed out while rendering".to_string());
        }

        // A stale file would make the completion poll pass instantly — the OS
        // save dialog already confirmed overwrite, so clear it first.
        let _ = std::fs::remove_file(&save_path);

        let mm_to_pt = 72.0 / 25.4;
        let paper_w = (page.width_mm * mm_to_pt) as f64;
        let paper_h = (page.height_mm * mm_to_pt) as f64;
        let m_top = (page.margin.top * mm_to_pt) as f64;
        let m_right = (page.margin.right * mm_to_pt) as f64;
        let m_bottom = (page.margin.bottom * mm_to_pt) as f64;
        let m_left = (page.margin.left * mm_to_pt) as f64;

        let ns_window = win.ns_window().map_err(|e| format!("ns_window: {e}"))? as usize;
        let path_for_print = save_path.clone();
        let (dtx, drx) = tokio::sync::oneshot::channel::<Result<(), String>>();
        win.with_webview(move |wv| {
            let res = unsafe {
                macos_print_to_pdf(
                    wv.inner(),
                    ns_window as *mut std::ffi::c_void,
                    &path_for_print,
                    paper_w,
                    paper_h,
                    m_top,
                    m_right,
                    m_bottom,
                    m_left,
                )
            };
            let _ = dtx.send(res);
        })
        .map_err(|e| format!("with_webview: {e}"))?;
        drx.await
            .map_err(|_| "print dispatch dropped".to_string())??;

        // `runOperationModalForWindow` returns before the file is written —
        // poll for a stable, non-empty file.
        let mut ok = false;
        let mut last_len = 0u64;
        for _ in 0..100 {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            match std::fs::metadata(&save_path) {
                Ok(m) if m.len() > 0 => {
                    if m.len() == last_len {
                        ok = true;
                        break;
                    }
                    last_len = m.len();
                }
                _ => {}
            }
        }
        let _ = win.close();
        if !ok {
            return Err("print did not produce a PDF file".to_string());
        }
        Ok(save_path)
    }
}

/// Drives WKWebView's print operation straight to a PDF file: the same
/// `printOperationWithPrintInfo:` + `runOperationModalForWindow:` pair wry uses
/// for the dialog print (proven to render our preview correctly), with the
/// panel suppressed and the job disposition set to save-to-URL.
///
/// Safety: must run on the main thread with valid WKWebView/NSWindow pointers —
/// guaranteed by `with_webview` (main-thread closure) and `ns_window()`.
#[cfg(target_os = "macos")]
unsafe fn macos_print_to_pdf(
    webview: *mut std::ffi::c_void,
    ns_window: *mut std::ffi::c_void,
    save_path: &str,
    paper_w_pt: f64,
    paper_h_pt: f64,
    m_top: f64,
    m_right: f64,
    m_bottom: f64,
    m_left: f64,
) -> Result<(), String> {
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, NSObjectProtocol};
    use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob, NSWindow};
    use objc2_foundation::{NSSize, NSString, NSURL};
    use objc2_web_kit::WKWebView;

    if webview.is_null() || ns_window.is_null() {
        return Err("print: null webview/window handle".to_string());
    }
    let wk: &WKWebView = &*(webview as *const WKWebView);
    let window: &NSWindow = &*(ns_window as *const NSWindow);

    if !wk.respondsToSelector(objc2::sel!(printOperationWithPrintInfo:)) {
        return Err("print: WKWebView print requires macOS 11+".to_string());
    }

    // Fresh NSPrintInfo (not the shared one — leave global state alone), set to
    // save straight to `save_path` with the document's paper size and margins.
    let print_info: Retained<NSPrintInfo> = msg_send![objc2::class!(NSPrintInfo), new];
    print_info.setJobDisposition(NSPrintSaveJob);
    let url = NSURL::fileURLWithPath(&NSString::from_str(save_path));
    let dict = print_info.dictionary();
    let _: () = msg_send![&*dict, setObject: &*url, forKey: NSPrintJobSavingURL];
    print_info.setPaperSize(NSSize {
        width: paper_w_pt,
        height: paper_h_pt,
    });
    print_info.setTopMargin(m_top);
    print_info.setRightMargin(m_right);
    print_info.setBottomMargin(m_bottom);
    print_info.setLeftMargin(m_left);

    let op = wk.printOperationWithPrintInfo(&print_info);
    op.setShowsPrintPanel(false);
    op.setShowsProgressPanel(false);
    op.setCanSpawnSeparateThread(true);

    // WKWebView print operations must run modally attached to a window (wry
    // does the same); with the panel hidden and a save disposition this shows
    // no UI and completes in the background.
    let op_obj: &AnyObject = &op;
    let _: () = msg_send![
        op_obj,
        runOperationModalForWindow: window,
        delegate: Option::<&AnyObject>::None,
        didRunSelector: Option::<objc2::runtime::Sel>::None,
        contextInfo: std::ptr::null_mut::<std::ffi::c_void>()
    ];
    Ok(())
}
