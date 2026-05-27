# UI Mobile QA

Validated baseline: post-FP-5 final polish pass  
Date: 2026-05-27

## Viewports Checked

| Viewport | Result | Notes |
|---|---|---|
| 375px (iPhone SE) | Pass | No horizontal overflow, bottom nav fits 4 items |
| 414px (iPhone 12) | Pass | Bottom nav usable, cards full width |
| 768px (iPad) | Pass | Tablet layout usable, single column |
| Desktop ≥1024px | Pass | Sidebar visible, content area constrained |

## Workflow Checks

| Workflow | Mobile Result | Notes |
|---|---|---|
| Connect wallet | Pass | Landing page centered, button accessible |
| Register (patient/doctor) | Pass | Form fields full width |
| Upload record | Pass | Upload panel opens from button, closeable |
| View own record | Pass | RecordViewer modal fits screen, preview scrollable |
| Archive/restore record | Pass | ConfirmModal readable |
| Share access (grant) | Pass | Form usable |
| Approve/reject request | Pass | Buttons wrap on small screens |
| Revoke access | Pass | ConfirmModal with plain language |
| Emergency configure | Pass | Trusted contacts form usable |
| Prepare emergency keys | Pass | Button accessible |
| Request emergency access | Pass | ConfirmModal before action |
| Open emergency session | Pass | Button and viewer work |
| End emergency session | Pass | ConfirmModal readable |
| Settings/privacy | Pass | Key status card, expandable sections |

## Accessibility Checks

- [x] Touch targets at least 44px (buttons, inputs, nav items)
- [x] No horizontal scrolling at any tested viewport
- [x] Long wallet addresses truncate or word-break
- [x] Technical details collapsed by default
- [x] Modals/viewers fit screen with scroll
- [x] Bottom nav does not cover primary action buttons (padding-bottom applied)
- [x] Form inputs have visible labels
- [x] Focus states visible on interactive elements
- [x] Color is not the only status indicator (text labels accompany badges)

## Navigation

- [x] Desktop sidebar shows at ≥1024px
- [x] Mobile bottom nav shows at <1024px
- [x] Active page clearly highlighted in both nav modes
- [x] 4 nav items fit without wrapping on mobile
- [x] Page headers provide context on every page

## Known Limitations

- Browser wallet UX depends on MetaMask mobile/browser environment
- Prototype has not undergone formal clinical usability testing
- PDF preview in RecordViewer requires browser PDF support (most modern browsers)
- Emoji icons may render differently across OS/browser combinations
- No offline/service-worker support
