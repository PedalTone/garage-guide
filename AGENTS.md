# Garage Guide project instructions

Garage Guide is a private, device-local vehicle document and maintenance hub for one person managing passenger vehicles in Virginia.

Prioritize documents and deadlines, then fast maintenance capture, then owner-confirmed maintenance schedules. User records and images stay in IndexedDB. No cloud data, analytics, remote fonts, or cloud AI belong in the MVP. The only planned data transmission is a user-consented VIN lookup with NHTSA.

Design mobile-first for iPhone 17 Pro Max, including safe-area insets, 44px minimum touch targets, camera/file capture, and installed-PWA behavior. Also verify 360×740, 390×844, 768×1024, and 1440×900 layouts, plus 200% zoom.

All extracted fields are suggestions until reviewed. Dates and maintenance guidance must remain editable and source-attributed. Never use real personal data in code, tests, screenshots, or fixtures.

Before completion, render and visually inspect the complete journey at all required sizes. Fix readability, clipping, spacing, interaction, and conceptual-flow problems rather than relying only on a successful build.

## Versioning

Show the current version beside the Garage Guide title. Use semantic versioning from this point forward: increment the major number for incompatible data or workflow changes, the minor number for meaningful new capabilities, and the patch number for fixes or small refinements. Keep the visible version and app metadata in sync.
