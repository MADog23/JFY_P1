/**
 * PHASE 1 IMAGE STORAGE — INTENTIONALLY A PLACEHOLDER
 * ----------------------------------------------------
 * Per the project brief, image capture is visible in the UI (see ImageCapture component
 * and actions/items.ts:addImagePlaceholder) but not yet wired to real file storage.
 * ItemImage.url stays null; only who/when/caption is recorded, so the audit trail is
 * already real even though the pixels aren't stored yet.
 *
 * TO CONNECT REAL STORAGE LATER (e.g. Cloudflare R2 or AWS S3):
 *   1. Add an S3-compatible client (e.g. `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`).
 *   2. Add env vars: STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY.
 *   3. Add a server action `getUploadUrl(itemId)` that returns a presigned PUT URL.
 *   4. In the ImageCapture component, upload the captured file directly to that URL from
 *      the browser, then call addImagePlaceholder(itemId, caption, resultingObjectUrl)
 *      — extend that action to accept and store the real `url` instead of null.
 *   5. Nothing else changes: the schema, audit logging, and client-view redaction rules
 *      already treat ItemImage as a first-class record.
 */
export const IMAGES_WIRED_UP = false;
