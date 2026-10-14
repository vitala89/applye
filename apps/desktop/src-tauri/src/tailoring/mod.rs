//! Tailoring block model, theme cascade, cache, and DOCX/PDF renderers.
//! Documents export calls this feature. It does not call `commands`.
//! The old generated-document journal is not a callable export path.

pub(crate) mod blocks;
pub(crate) mod cache;
pub(crate) mod docx;
pub(crate) mod fonts;
pub(crate) mod markdown;
pub(crate) mod page;
pub(crate) mod pdf;
pub(crate) mod style;
pub(crate) mod theme;

pub(crate) use blocks::{
    render_blocks_pdf, resolve_blocks, resolve_cv_blocks, BlockLevel, StyledBlock,
};
