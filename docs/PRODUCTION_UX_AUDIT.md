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


## Implementation progress — responsive role workspaces

The follow-on implementation adds role-scoped responsive behavior:

- Scanner workspace: controls wrap into usable touch targets on phones; scanner input and submit action retain a usable width; camera and status/error content are bounded to the workspace.
- Restaurant administration: the multi-section navigation wraps into readable, tappable controls; form labels, fields, and error messages are enlarged on small screens.
- Platform administration: tab navigation and onboarding actions wrap on phones; dense tenant tables remain in their own horizontal scroll regions.
- Authentication: activation and recovery form fields stack on very narrow screens; labels and controls use more legible mobile sizing.
- Customer portal: mobile bottom navigation has larger labels and touch targets; header actions can wrap.
- Accessibility: removed the viewport setting that disabled pinch zoom, and enabled safe-area viewport support for modern mobile devices.

- Very narrow admin onboarding and management forms stack two-column fields; customer bottom navigation respects device safe-area insets.

The changes are presentation-layer adjustments only. They do not intentionally alter authentication policy, tenant boundaries, balances, payment processing, scan authorization, offline synchronization, or backup behavior.

## Validation status

The initial responsive-foundation commit passed the full repository CI workflow, including typecheck, security/integrity tests, backup/restore checks, Docker runtime tests, and production build. The expanded role-specific changes require their own latest-commit CI result. Browser-based viewport and assistive-technology verification is still outstanding; the source review must not be treated as proof of visual responsiveness.


## Follow-on responsive refinements

- Added explicit global-header layout hooks so brand context and action controls wrap predictably on phone widths instead of relying only on generic header descendant selectors.
- Constrained facility and profile dropdown width and height to the viewport, with independent scrolling for long tenant lists.
- Increased language-switcher touch target dimensions and added consistent visible keyboard focus styling.
- Stacked two-column operational grids on narrow phones and bounded role-workspace dialogs to the available viewport height.
- Latest CI run for commit `9c984b5a99d336866b91d8297cfc00ec7fac12b1` completed successfully. These follow-on commits require a fresh CI run.

## Remaining release gates

- Browser-based visual review is still not available from this repository session. Verify 320/360/390/430/768/1024/1440/1920px viewports, including keyboard navigation, dropdown positioning, scanner result/error states, and table scrolling.
- Restaurant-admin view decomposition remains outstanding. It must be performed by extracting isolated sections with their existing props/state boundaries and verified after each extraction; do not rewrite the full workflow in one pass.
- Do not merge or deploy solely on CI success. CI validates code/build/runtime invariants but does not prove visual correctness or live Google Drive backup connectivity.


## Latest interaction and navigation pass

- Restaurant administration primary navigation now exposes a named navigation landmark and marks the selected section with `aria-current="page"`.
- Secondary patron/card/pricing navigation has a named landmark and uses a single-column touch layout on narrow phones; the primary section navigation uses two columns down to 361px and one column at 360px and below.
- Scanner token entry now has an explicit accessible name, disables irrelevant browser autocomplete, and exposes a mobile-friendly enter-key hint.
- On very narrow phones (380px and below), the scan action moves below the input as a full-width button rather than competing with the token text for horizontal space.
- These changes preserve scan handling and authorization logic; they only adjust input semantics and presentation.

## Updated manual viewport acceptance matrix

Before merge, verify each role and representative workflow at 320px, 360px, 390px, 430px, 768px, 1024px, 1440px, and 1920px:
- Global header: brand, role actions, facility dropdown, profile dropdown, language control, Escape close.
- Restaurant admin: all section tabs, sub-navigation, member directory table, registration form, approvals, pricing, reports, billing, appearance and security.
- Scanner: USB keyboard-wedge scanner, manual token entry, camera permission/preview, success/rejection/photo mismatch, recent servings, PIN desk and registration/top-up dialogs.
- Super admin: onboarding, plans, licensing, student subscription policy and financial exceptions.
- Customer: dashboard, card/pass, top-up, history and bottom navigation.
- Confirm no page-level horizontal scroll; table overflow must be contained in its own region; modal content must remain reachable with the virtual keyboard open; keyboard focus must be visible.

The viewport matrix is a required human/browser acceptance test. Passing CI alone does not satisfy it.
