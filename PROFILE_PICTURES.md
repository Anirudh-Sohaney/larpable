# Profile pictures

Pictures are optional. Accounts without an upload receive a deterministic SVG
avatar generated from the first username letter and one of five dark backgrounds.
This requires no migration or writes to existing accounts.

The shared browser cropper accepts JPEG, PNG, WebP, GIF and AVIF where supported by
the browser, with a 12 MB source-file limit and a 40 megapixel limit. Dragging,
arrow keys and a zoom slider position a circular preview. A 256px WebP crop is
submitted through the existing signup or profile-update request. The original
file is never uploaded. Animated formats use a still frame.

The server independently decodes, checks pixel limits, strips metadata and
re-encodes the image as a 256px WebP. At most two image conversions run at once.
The existing 1 MB JSON request cap also applies to these cropped payloads.
Only the normalized image is stored, encrypted in `encrypted_fields.profile_picture`.
Keeping it in the account record makes picture and profile updates one atomic
write, avoids orphan files, and uses existing account-deletion behavior. Omitted
picture fields preserve the current image; explicit null restores the letter avatar.

`GET /api/profiles/:id/picture` serves the image separately from profile/feed JSON,
with MIME enforcement, ETag revalidation and no content sniffing. Profiles render
it at a fixed size with a circular mask. Image processing loads only for uploads.

Run `npm test` for format and API coverage, including unchanged unrelated fields,
failed-upload preservation, signup, cache revalidation, reset and deletion.
