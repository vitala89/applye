fn main() {
    // The app icon is embedded into the binary at compile time by
    // `generate_context!()`. Cargo does not otherwise notice when the PNG/ICNS
    // files change, so a plain `tauri dev` keeps the previously embedded icon.
    // Re-run the build (and recompile) whenever anything under icons/ changes.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
