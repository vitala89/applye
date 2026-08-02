// The embedded font faces, shared by both exporters.
//
// They live apart from either renderer because both need them: the PDF side
// measures and embeds them directly, the DOCX side hands the same bytes to
// docx-rs. Keeping them in one of the two would have made the other import its
// fonts from a module named for a format it does not produce.
//
// See assets/fonts/NOTICE.md for the clone -> original mapping and licenses.

pub(super) const FONT_CARLITO_R: &[u8] = include_bytes!("../../assets/fonts/Carlito-Regular.ttf");
pub(super) const FONT_CARLITO_B: &[u8] = include_bytes!("../../assets/fonts/Carlito-Bold.ttf");
pub(super) const FONT_ARIMO_R: &[u8] = include_bytes!("../../assets/fonts/Arimo-Regular.ttf");
pub(super) const FONT_ARIMO_B: &[u8] = include_bytes!("../../assets/fonts/Arimo-Bold.ttf");
pub(super) const FONT_TINOS_R: &[u8] = include_bytes!("../../assets/fonts/Tinos-Regular.ttf");
pub(super) const FONT_TINOS_B: &[u8] = include_bytes!("../../assets/fonts/Tinos-Bold.ttf");
pub(super) const FONT_GELASIO_R: &[u8] = include_bytes!("../../assets/fonts/Gelasio-Regular.ttf");
pub(super) const FONT_GELASIO_B: &[u8] = include_bytes!("../../assets/fonts/Gelasio-Bold.ttf");
pub(super) const FONT_LATO_R: &[u8] = include_bytes!("../../assets/fonts/Lato-Regular.ttf");
pub(super) const FONT_LATO_B: &[u8] = include_bytes!("../../assets/fonts/Lato-Bold.ttf");
pub(super) const FONT_OPENSANS_R: &[u8] = include_bytes!("../../assets/fonts/OpenSans-Regular.ttf");
pub(super) const FONT_OPENSANS_B: &[u8] = include_bytes!("../../assets/fonts/OpenSans-Bold.ttf");
