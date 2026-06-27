// OS keychain operations — API keys stored via keyring crate.
// Keys never in plaintext, never logged.
// Service name: "applye", username: provider name (e.g. "claude", "openai").
// TODO (Phase 1): add keyring = "3" to Cargo.toml, implement get/set/delete.

pub struct KeyStore;

impl KeyStore {
    // TODO (Phase 1): pub fn set_key(provider: &str, key: &str) -> anyhow::Result<()>
    // TODO (Phase 1): pub fn get_key(provider: &str) -> anyhow::Result<Option<String>>
    // TODO (Phase 1): pub fn delete_key(provider: &str) -> anyhow::Result<()>
}
