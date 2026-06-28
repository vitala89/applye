// OS keychain operations — provider API keys stored via the `keyring` crate.
// macOS Keychain / Windows Credential Manager / Linux Secret Service.
// Keys are never written to SQLite, logs, or the repo, and the raw key is
// never returned to the frontend — only store / check / delete.

use keyring::{Entry, Error as KeyringError};

/// Keychain service name (account = provider, e.g. "anthropic").
const SERVICE: &str = "dev.applye.desktop";

pub struct KeyStore;

impl KeyStore {
    fn entry(provider: &str) -> Result<Entry, String> {
        Entry::new(SERVICE, provider).map_err(|e| format!("keychain entry: {e}"))
    }

    pub fn set_key(provider: &str, key: &str) -> Result<(), String> {
        Self::entry(provider)?
            .set_password(key)
            .map_err(|e| format!("keychain set: {e}"))
    }

    /// Returns the stored key, or `None` if no entry exists. Used internally by
    /// `ai_run` — the raw value is never exposed to the frontend.
    pub fn get_key(provider: &str) -> Result<Option<String>, String> {
        match Self::entry(provider)?.get_password() {
            Ok(k) => Ok(Some(k)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(e) => Err(format!("keychain get: {e}")),
        }
    }

    pub fn delete_key(provider: &str) -> Result<(), String> {
        match Self::entry(provider)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(e) => Err(format!("keychain delete: {e}")),
        }
    }
}

#[tauri::command]
pub fn keys_set_provider_key(provider: String, key: String) -> Result<(), String> {
    KeyStore::set_key(&provider, &key)
}

#[tauri::command]
pub fn keys_has_provider_key(provider: String) -> Result<bool, String> {
    Ok(KeyStore::get_key(&provider)?.is_some())
}

#[tauri::command]
pub fn keys_delete_provider_key(provider: String) -> Result<(), String> {
    KeyStore::delete_key(&provider)
}
