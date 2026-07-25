-- A single reusable applicant photo on the profile, so a CV that needs one
-- (German market convention) can take it without the user re-uploading and
-- re-cropping per document. Stored already cropped to the CV frame as a JPEG
-- data URI - the same shape `document_library` photo blocks use.
ALTER TABLE profile ADD COLUMN photo_data_uri TEXT;
