//! Tracklist file reading. XLS/XLSX parsing stays inside `catch_parser_panic`.
//! Nothing here is logged and nothing is sent off the machine.

use serde::Serialize;

use crate::commands::untrusted::catch_parser_panic;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFileContent {
    pub file_type: String,
    pub content: String,
}

pub(crate) fn read_file(path: &str) -> Result<ImportFileContent, String> {
    let lower = path.to_lowercase();
    if lower.ends_with(".xlsx") || lower.ends_with(".xls") {
        Ok(ImportFileContent {
            file_type: "xlsx".to_string(),
            content: read_xlsx_as_csv(path)?,
        })
    } else if lower.ends_with(".json") {
        Ok(ImportFileContent {
            file_type: "json".to_string(),
            content: read_text(path)?,
        })
    } else if lower.ends_with(".csv") {
        Ok(ImportFileContent {
            file_type: "csv".to_string(),
            content: read_text(path)?,
        })
    } else {
        Ok(ImportFileContent {
            file_type: "text".to_string(),
            content: read_text(path)?,
        })
    }
}

fn read_text(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("import_read_file: {e}"))
}

fn read_xlsx_as_csv(path: &str) -> Result<String, String> {
    use calamine::{open_workbook, Reader, Xlsx};

    // The whole calamine interaction sits inside the panic guard, not just the
    // open: `worksheet_range` is where the XML body is actually walked, and
    // that is the part fed by the untrusted file. See `audit.toml` - calamine
    // still pins a `quick-xml` with two open DoS advisories and has no newer
    // release, so this path is the one carrying known-unfixed parser risk.
    let range = catch_parser_panic(
        "read_xlsx_as_csv",
        || -> Result<calamine::Range<calamine::Data>, String> {
            let mut workbook: Xlsx<_> =
                open_workbook(path).map_err(|e| format!("read_xlsx_as_csv: open: {e}"))?;
            let sheet_name = workbook
                .sheet_names()
                .first()
                .cloned()
                .ok_or_else(|| "read_xlsx_as_csv: workbook has no sheets".to_string())?;
            workbook
                .worksheet_range(&sheet_name)
                .map_err(|e| format!("read_xlsx_as_csv: {e}"))
        },
    )??;

    let mut out = String::new();
    for row in range.rows() {
        let line = row
            .iter()
            .map(|cell| cell.to_string().replace(',', " "))
            .collect::<Vec<_>>()
            .join(",");
        out.push_str(&line);
        out.push('\n');
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_csv_json_and_text_files_by_extension() {
        let dir = std::env::temp_dir().join(format!(
            "applye-import-test-{:?}",
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let csv_path = dir.join("jobs.csv");
        std::fs::write(&csv_path, "Company,Role\nAcme,Engineer\n").unwrap();
        let csv = read_file(&csv_path.to_string_lossy()).unwrap();
        assert_eq!(csv.file_type, "csv");
        assert!(csv.content.contains("Acme,Engineer"));

        let json_path = dir.join("jobs.json");
        std::fs::write(&json_path, r#"[{"company":"Acme"}]"#).unwrap();
        let json = read_file(&json_path.to_string_lossy()).unwrap();
        assert_eq!(json.file_type, "json");

        let txt_path = dir.join("jobs.txt");
        std::fs::write(&txt_path, "Acme - Engineer - Applied").unwrap();
        let text = read_file(&txt_path.to_string_lossy()).unwrap();
        assert_eq!(text.file_type, "text");

        std::fs::remove_dir_all(&dir).ok();
    }
}
