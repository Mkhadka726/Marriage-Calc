
# Marriage Table

A mobile-friendly scorekeeper for people playing the Nepali Marriage card game with physical cards.

Enter Maal points, select a winner and track round scores without doing every calculation by hand.

**[Open the live app](https://mkhadka726.github.io/Marriage-Calc/)** · **[GitHub repository](https://github.com/Mkhadka726/Marriage-Calc)**

## Project status

Marriage Table is my first GitHub learning project and an evolving web-app pilot. It is a calculator, not a playable digital card game.

The app implements a specific, configurable set of house rules. Marriage rules vary between groups: agree on the settings before playing and compare the results with your table's calculations before relying on them.

## Features

- Five player-name fields by default, expandable to ten session members.
- Add or remove setup players; only named players enter the round.
- Configurable Seen, Unseen, Dublee and foul point values.
- Optional rate per point and currency selection.
- A winner dropdown and checkboxes with protection against selecting two winners.
- Maal inputs starting at zero, with positive Maal automatically changing Unseen to Seen.
- Seen, Unseen, Dublee, Foul and Hold statuses.
- Round summaries and an all-rounds scoreboard with winner crowns and Maal-status indicators.
- Corrections to saved rounds, with affected scores and foul adjustments recalculated.
- Automatic local session saving, Continue Session and Previous Sessions.
- JSON backup export.
- Home Screen installation support and offline application caching after initial online setup.

Backup import has been added to the local update. If the deployed app shows **Import Session Backup**, it supports reviewed, additive imports: identical session contents are skipped and differing versions are kept separately. Availability on the live site depends on whether that update has been deployed.

Ten session members is a calculator limit, not a claim that ten players can play the standard three-deck game simultaneously.

## How to use

1. Open the live app and choose **New Session**.
2. Review your house rules, rate and currency.
3. Name the session and enter the participating players.
4. Start the round, enter each player's Maal and select one winner.
5. Choose the correct player statuses and calculate the result.
6. Review the round summary and session totals.
7. Choose **Next Game** for another round, or edit an earlier round if needed.
8. Export session backups regularly.

**Settle Money** provides suggested transfers based on saved scores. It does not send money or record payments already made. Its instructions assume no previous payments, so do not treat repeated settlement suggestions as new amounts owed.

## Scoring model

For a round with `N` participating players:

```text
Net Maal points = (N × player's effective Maal) − total effective Maal

Final points = net Maal points
             + winning-point adjustment
             + previous-round foul adjustment

Amount = final points × rate per point
```

Positive results mean **receives**; negative results mean **pays**. Hold players are excluded from that round's Maal and winning-point calculation.

### House rules implemented

| Rule | Behaviour |
| --- | --- |
| Seen opponent | Pays the configured Seen game points to the finisher; default 3. |
| Unseen opponent | Pays the configured Unseen game points to the finisher; default 10. |
| Dublee opponent | After viewing the joker through Dublee, pays no winning points but still participates in Maal settlement. |
| Dublee finisher | Receives the configured bonus, default 5, in effective Maal before settlement. The original Maal input is not overwritten. |
| Foul player | Participates in Maal settlement but pays no winning points in the foul's round. |
| Foul carry-over | The configured penalty is deducted from the offender and credited to the following round's winner exactly once. |
| Offender wins the next round | Their own foul deduction and bonus cancel; the obligation ends. |
| Offender leaves or is on Hold | Their previous foul obligation still applies without including them in the new round's Maal calculation. |
| Last round has a pending foul | The app leaves it pending and blocks final settlement until the next winner is known. |

Foul points use the originating round's configured penalty and the receiving round's rate for currency amounts. A Foul status currently records one configured penalty per player per round; it is not a multiple-incident penalty log.

The finisher is not necessarily the highest net earner: another player's Maal can produce a positive balance.

### Worked example

Five players participate. Madan finishes normally. Madan and Suman each hold 10 Maal; the other three players are Unseen with zero Maal. Seen points are 3 and Unseen points are 10.

Total Maal is **20**.

| Player | Status | Maal | Net Maal | Game adjustment | Final points |
| --- | --- | ---: | ---: | ---: | ---: |
| Madan | Seen, winner | 10 | +30 | +33 | **+63** |
| Suman | Seen | 10 | +30 | -3 | **+27** |
| Asha | Unseen | 0 | -20 | -10 | **-30** |
| Bikash | Unseen | 0 | -20 | -10 | **-30** |
| Ram | Unseen | 0 | -20 | -10 | **-30** |
| **Total** | | **20** | **0** | **0** | **0** |

At NPR 1 per point, Madan receives NPR 63 and Suman receives NPR 27; each other player pays NPR 30.

## Privacy and saved games

**The same link provides the same app, not a shared game history.**

- Sessions are stored using browser `localStorage` on the device where they were created.
- There is no account system, shared game database or automatic cross-device synchronisation.
- The application does not send entered player names or scores to a backend.
- Someone using the same browser profile may be able to view its saved sessions. Local storage is not password-protected or encrypted by this app.
- Clearing browser/site data, private browsing or device storage eviction can remove sessions.
- Local files, the hosted website and an installed Home Screen app may use different storage contexts. Do not assume they share history.
- Exported JSON backups contain player names, scores and session information. Keep them private; **do not commit session backups to GitHub**.
- Hosting providers process normal website requests under their own policies. Device-local scoring is not a claim that visiting a hosted site creates no network traffic.

An imported backup is a separate copy. Later changes are not synchronised with the original device.

## Run locally

No application build step or package installation is required for the current web version.

1. Download the repository using **Code → Download ZIP**, or clone it with Git.
2. Extract the files, keeping their folder structure.
3. Open `index.html` in a modern browser.

For reliable storage behaviour and PWA development, use a local web server on `localhost`. Service workers require a secure context: HTTPS or a supported local-development origin. They do not run from a `file://` address.

## Install on a phone

### iPhone

Open the live URL in Safari, choose **Share → Add to Home Screen**, and enable **Open as Web App** if offered.

### Android

Open the live URL in Chrome and use the in-app installation button when available, or the browser's **Install app / Add to Home screen** menu.

This is an installable web app, not an App Store listing or an APK.

Open the app online first and wait for the offline-ready message. Offline availability depends on successful caching and retained device storage.

## Technology and project structure

| File | Purpose |
| --- | --- |
| `index.html` | Home, rules, players, round entry, summaries and dialogs. |
| `style.css` | Responsive layout, playing-card artwork styling and colour themes. |
| `app.js` | Player state, scoring, round editing, sessions and backups. |
| `pwa.js` | Installation guidance, service-worker registration and update controls. |
| `sw.js` | Versioned offline application cache. |
| `manifest.webmanifest` | App name, installation icons, start URL and display mode. |
| `icons/` | Android/PWA and Apple Home Screen icons. |

Built with **HTML, CSS and vanilla JavaScript**, hosted using **GitHub Pages**.

## Publishing changes

Local edits do not automatically update the website unless they are committed and pushed, or uploaded to the correct GitHub repository.

1. Keep a backup and review the changed application files.
2. Increment `VERSION` in `sw.js` whenever cached application files change.
3. Update the displayed app version where appropriate.
4. Publish the updated files to this repository's Pages source.
5. Wait for the Pages deployment to finish.
6. Reopen the live app. If an update is offered, close other app tabs and use **Save & load update**.

Do not upload `.git`, personal session exports or credentials.

## Known limitations

- The app relies on manually entered Maal; it does not recognise cards or verify a hand's legal declaration.
- Settlement instructions do not account for payments already made.
- Saved data is device-local and can be lost; export backups.
- There is no playable digital Marriage mode, multiplayer room or shared scoreboard.
- Do not assume every device, browser or house-rule variation is supported. Real-table trials and further device coverage are ongoing.

## Learning and development

I built Marriage Table as my first guided GitHub project, starting with a simple rules page and expanding it into a scorekeeper.

The work has involved learning HTML structure, CSS styling, JavaScript events and state, scoring formulas, debugging, Git/GitHub and web deployment.

**AI assistance:** This project was developed with substantial AI coding and debugging assistance. I supplied and refined the house rules, directed the interface, worked through the implementation and deployed the website. The code and claims should be evaluated on their actual behaviour, not treated as independently certified.

## Feedback

Report bugs through this repository's **Issues** tab. Include the steps, expected result, actual result and browser/device.

Use fictional player names and scores in reports. Remove personal information from screenshots and never attach an actual session backup publicly.

This is an independent project and is not affiliated with or endorsed by a card-game publisher.

**Short version for a one-page résumé:**

> Built and deployed Marriage Table, a responsive JavaScript scorekeeper with configurable scoring rules, editable round history, local session persistence and installable web-app support. Managed the project using Git/GitHub and published it through GitHub Pages.

## Make the repository support those claims

Your GitHub README should include:
1. The live link and a short explanation of the problem.
2. Screenshots of Home, round entry and the scoreboard using fictional players.
3. Setup instructions: download the files and open `index.html`; installation/offline features require HTTPS hosting.
4. Limitations: device-local storage, no automatic synchronisation, and settlement instructions—not payment processing.
5. An acknowledgement: **“Built as a guided learning project with AI assistance; I customised the interface and house rules and worked through implementation and debugging.”**

**Don’t list backup import as deployed until the latest GitHub update is live.** Avoid claims such as “production-grade,” “used by hundreds” or “built entirely independently” without evidence.[README.md](https://github.com/user-attachments/files/33643575/README.md)
