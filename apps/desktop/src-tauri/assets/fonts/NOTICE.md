# Bundled fonts - attribution & licenses

These TrueType faces are embedded into PDF exports so the Rust `printpdf`
path renders the user's chosen family accurately instead of approximating it
with one of the 14 base fonts. Every face below is a **metric-compatible,
freely-redistributable clone** of a proprietary ATS-safe font - we never
bundle the proprietary originals (Calibri, Arial, Times New Roman, Georgia).

| User font (proprietary)    | Bundled clone | Source                                              | License                                                                     |
| -------------------------- | ------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| Calibri                    | Carlito       | https://github.com/googlefonts/carlito              | SIL OFL 1.1 (`licenses/Carlito-OFL.txt`)                                    |
| Arial / Helvetica          | Arimo         | https://github.com/googlefonts/Arimo                | SIL OFL 1.1 (`licenses/Arimo-OFL.txt`)                                      |
| Times New Roman / Garamond | Tinos         | https://github.com/google/fonts/tree/main/ofl/tinos | Apache-2.0 (`licenses/Tinos-Apache-2.0.txt`); google/fonts also tags it OFL |
| Georgia                    | Gelasio       | https://github.com/SorkinType/Gelasio               | SIL OFL 1.1 (`licenses/Gelasio-OFL.txt`)                                    |
| Lato (native)              | Lato          | https://github.com/google/fonts/tree/main/ofl/lato  | SIL OFL 1.1 (`licenses/Lato-OFL.txt`)                                       |
| Open Sans (native)         | Open Sans     | https://github.com/googlefonts/opensans             | SIL OFL 1.1 (`licenses/OpenSans-OFL.txt`)                                   |

Each family ships Regular + Bold. Monospace families (Courier / Consolas /
"mono") keep the `printpdf` built-in Courier, which is already a real
monospace metric. Italic is not bundled - the CV style model emits no italic
runs today; add faces here if that changes.

Carlito and Arimo are metrically compatible with Calibri and Arial
respectively; Tinos with Times New Roman; Gelasio approximates Georgia.
Substituting the clone keeps line breaks and page fit consistent with what
the user sees for the proprietary font in Word/DOCX.
