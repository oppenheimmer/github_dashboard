## Github Dashboard

This tiny project aims to make a dashboard for displaying Github activities from different accounts under one activity calendar. Currently this is hardcoded to the only 2 accounts I use: a main, and a test account. This project was designed with help of OpenAI Codex.

| Attribute     | Value         |
| ------------- | ------------- |
| Date of Revision | 2025-11-21 |
| Revision number  | 0.1b       |

### Project files
- `index.html`: Embeddable page shell that wires the profile header, stat lines, and contribution calendars together.
- `styles.css`: GitHub-inspired styling for the header, stacked avatars, stat lines, and contribution grid layout (desktop and mobile responsive tweaks included).
- `app.js`: Vanilla JS that fetches GitHub data (profile + contributions), caches responses, builds the aligned month grid for current/previous year, and renders combined stats for `gradientwolf` and `oppenheimmer`.
- `image.png`: Reference mock that illustrates the intended layout for the profile header and activity calendar.

