# Third-party resources

## LDNOOBW word lists

`src/moderation-words.js` contains the English (`en`, 403 entries) and Chinese (`zh`, 319 entries) lists from **List of Dirty, Naughty, Obscene, and Otherwise Bad Words**, by the LDNOOBW contributors.

- Source: https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
- Retrieved: 2026-11-10, `master/en` and `master/zh`.
- License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/ . The license text is included as `ldnoobw-CC-BY-4.0.txt`.
- Changes: line-based files are represented as JavaScript arrays. The entries themselves are unchanged. Matching behavior belongs to the website, not the original project.

## Font Awesome pen icon

The nickname edit indicator uses the **pen** SVG path from **Font Awesome Free 6.7.2**, by Fonticons, Inc. Copyright 2024 Fonticons, Inc.

- Source: https://github.com/FortAwesome/Font-Awesome/blob/6.x/svgs/solid/pen.svg
- License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/ . The same license text is included as `ldnoobw-CC-BY-4.0.txt`.
- License overview: https://fontawesome.com/license/free .
- Changes: embedded inline with `currentColor` and accessible button labeling; no icon font or third-party runtime is loaded.
