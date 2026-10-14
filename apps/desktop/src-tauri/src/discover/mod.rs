//! Discover scan, filtering, parsers, source management, and feed persistence.
//! Tauri adapters in `commands` delegate here.

pub(crate) mod fetch;
pub(crate) mod filter;
pub(crate) mod geo;
pub(crate) mod geo_countries;
pub(crate) mod parsers;
pub(crate) mod parsers_ats;
pub(crate) mod parsers_nofluffjobs;
pub(crate) mod scan;
pub(crate) mod sources;
