//! Tailoring block model, theme cascade, and DOCX/PDF renderers.
//! Documents export calls this feature. It does not call `commands`.

pub(crate) mod blocks;
pub(crate) mod cache;
pub(crate) mod docx;
pub(crate) mod files;
pub(crate) mod fonts;
pub(crate) mod generated;
pub(crate) mod markdown;
pub(crate) mod page;
pub(crate) mod pdf;
pub(crate) mod theme;

pub(crate) use blocks::{
    render_blocks_pdf, resolve_blocks, resolve_cv_blocks, BlockLevel, StyledBlock,
};
