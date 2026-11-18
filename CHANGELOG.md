# Changelog

## v5.5.0 (2026-11-18)

### Fixed
- **YouTube ads played at normal speed** on most videos. YouTube keeps its hover-preview player in the page after you open a video, and the ad skipper was watching that player instead of the main one. Every player on the page is now checked.
- The ad skipper stopped working in YouTube tabs that were left open while OpenBlocker updated. It now keeps working, and OpenBlocker re-injects it into open YouTube tabs after an update.

### Changed
- The ad's picture is hidden while the ad is sped through (muted, 16×).

## v5.4.0 (2026-11-18)

- Initial public release: Manifest V3 ad blocker with 15 default filter lists, scriptlets, advanced element hiding, stand-in scripts, link cleaning, a scam-site warning page, a pop-up blocker, YouTube ad skipping, an element picker, and a Liquid Glass interface in the new sunset colors.
