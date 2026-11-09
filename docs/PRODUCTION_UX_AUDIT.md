# RestoPass production UX and responsive audit

## Scope reviewed

Initial source-level review of the application shell and the principal role-based experiences:

- `src/App.tsx`
- `src/index.css`
- `src/components/common/Header.tsx`
- `src/components/common/AuthPortalView.tsx`
- `src/components/customer/CustomerPortalLayout.tsx`
- `src/components/scanner/ScannerView.tsx`
- `src/components/restaurant/RestaurantAdminView.tsx`
- `src/components/superadmin/SuperAdminView.tsx`

This is a code review, not a claim that every route has been visually exercised at every viewport. Browser-based viewport testing remains a required release gate.

## Findings

1. The restaurant administration view is a very large single React component (approximately 293 KB of source at the reviewed revision). This increases maintenance and regression risk; it should be decomposed incrementally by workflow rather than rewritten wholesale.
2. The super-admin and scanner views are also large components with multiple operational workflows. Their narrow-screen behavior needs route-by-route verification.
3. The global stylesheet had theme and print rules but no explicit application-wide responsive safety layer for root sizing, narrow-screen shell behavior, or dialog height.
4. The customer portal already has a mobile bottom navigation and responsive two-column-to-single-column layout. Its bottom navigation labels and touch targets needed strengthening.
5. Authentication already uses role-specific server login paths and restaurant context in the sign-in view. This UX pass deliberately does not change authentication, tenant authorization, session handling, or credential policy.
6. The source contains 10px/11px labels. Some are metadata and badges; these should not all be blindly enlarged. Operational instructions, field labels, errors, and key values should be prioritized for readable sizing during the screen-by-screen pass.
7. Existing horizontally scrollable strips and data tables should remain contained within their own regions; the document itself must not become horizontally scrollable.

## Changes in this branch so far

- Added root-level width and overflow safeguards, a 16px body text baseline, responsive main-shell gutters, media sizing constraints, and reduced-motion support.
- Added narrow-screen header wrapping and bounded modal scrolling without imposing a narrow maximum width on desktop dialogs.
- Added a minimum-width safeguard to the main application shell.
- Improved customer mobile navigation touch area and label size, and allowed the customer context actions to wrap on narrow screens.
- Reduced sign-in panel padding on small screens while preserving the desktop layout.

## Required next work

- Inspect and improve restaurant-admin navigation, dashboards, forms, transaction tables, and modal workflows.
- Inspect and improve scanner station layout for touch-first operation, including camera, hardware scanner, result states, and exception flows.
- Inspect and improve super-admin navigation, dense data tables, and settings forms.
- Review shared modal, table, empty-state, loading-state, error-state, and form components.
- Split the largest views into smaller workflow components where this can be done without changing business behavior.
- Run type-check, unit/integration tests, production build, and responsive browser checks at 360px, 390px, 430px, 768px, 1024px, 1440px, and 1920px.
- Confirm no unintended page-level horizontal scrolling, clipped actions, inaccessible controls, or regressions in customer, scanner, admin, billing, sync, and backup workflows.

## Release rule

Do not deploy or onboard the first restaurant based only on this initial CSS pass. The branch must pass automated checks and a browser-based responsive review before it is considered release-ready.
