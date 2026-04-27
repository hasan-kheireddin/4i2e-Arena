# Browser Compatibility

Supported target browsers:

- Latest stable Google Chrome
- Latest stable Firefox
- Latest stable Microsoft Edge
- Latest stable Safari

Implementation notes:

- The frontend uses React, Vite, TypeScript, Tailwind CSS, and Autoprefixer.
- `frontend/package.json` declares browser targets through `browserslist`.
- `frontend/src/index.css` includes compatibility handling for scrollbars, range inputs, focus normalization, and backdrop-filter fallback behavior.
- WebSocket URLs are same-origin by default when `VITE_WS_URL` is unset, which supports LAN testing through the deployed HTTPS origin.

Known limitations:

- Clipboard access can be blocked by browser permission policies or insecure contexts.
- Backdrop blur intensity may differ across rendering engines.
- Native form controls may render with small visual differences between browsers.
- Full browser compatibility still requires manual smoke testing in each target browser before evaluation.
