// Vite preview settings for the built site (make start, the e2e tests): `vite preview --config preview.config.ts`.
// VERIFIED: in its default single-page mode, preview answered a missing page with the overview and status 200, which
// would hide a broken link; as a multi-page app it serves "/usage" from usage.html and a missing page as a 404.
export default { appType: "mpa" };
