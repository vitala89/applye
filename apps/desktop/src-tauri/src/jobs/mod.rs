//! Job persistence, identity, paste, legitimacy, scoring cache, and legal URL fetch.
//! Tauri adapters in `commands` delegate here. Nothing here receives Tauri state.

pub(crate) mod archetypes;
pub(crate) mod identity;
pub(crate) mod legitimacy;
pub(crate) mod paste;
pub(crate) mod persistence;
pub(crate) mod provenance;
pub(crate) mod scoring;
pub(crate) mod url;

pub(crate) use persistence::{Job, JobInput, JobOverview};
