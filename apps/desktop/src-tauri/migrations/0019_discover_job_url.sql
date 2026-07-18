-- Discover feed UI: keep the original posting URL so the inline preview can
-- link back to the source ("View original posting"). Scan-inserted jobs only;
-- pasted jobs keep NULL.
ALTER TABLE jobs ADD COLUMN source_url TEXT;
