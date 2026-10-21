# Homepage resident quick access: staged for the live Utah Sands site

The existing `utahsands.com` homepage currently places resident services far below the first screen. This lightweight, dependency-free component brings three prominent choices immediately **after the site header and before the main hero**:

1. **Pay rent** → `/pay-rent.html` (payment preview only).
2. **Maintenance** → `/maintenance.html` (browser-local preview only).
3. **Apply for the home** → `/#details` (applications not yet open).

Desktop: three cards in a restrained dark-green / white / warm-cream palette. Mobile: the two frequently used resident actions stay side by side, with the application entry in a compact full-width row. Supports visible keyboard focus and reduced-motion settings.

## Integration into the real site

This repository **is not the source repository for the live ChatGPT Sites project**. Committing this code does not edit or publish `utahsands.com`. To integrate:

- Upload/copy `web/utahsands-home-quick-access.js` as `/assets/utahsands-home-quick-access.js` to the **existing Haviture / Utah Sands site project**.
- Add the following just before `</body>` on the homepage, without deleting the existing hero or its content:

```html
<script defer src="/assets/utahsands-home-quick-access.js"></script>
```

- If the site builder cannot use scripts, recreate the markup/styles from this component directly in the site's homepage editor.
- Visually verify on 320px, 375px, 430px phone widths and a desktop width; check the header doesn't overlap the inserted strip.
- Verify links resolve and retain the demo labels. **Do not remove the disclosures until the real backend has been connected and tested.**
- Do not change Cloudflare DNS or publish a replacement website as a workaround.

An isolated preview is in `web/quick-access-preview.html` (load it alongside the JS in a local browser). Unit tests: `npm test`.
