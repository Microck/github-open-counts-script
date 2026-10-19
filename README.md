# github open counts script

automatically adds open issue and pull request counts to github repository cards so you can see repository activity at a glance.

![github repository cards showing open issue and pull request counts](./screenshot.png)

## installation

1. install [violentmonkey](https://violentmonkey.github.io/) or [tampermonkey](https://www.tampermonkey.net/)
2. [click to install the script](https://github.com/Microck/github-open-counts-script/raw/main/github-repository-card-open-counts.user.js)
3. refresh your github profile or repositories page

if you see issue and pull request icons with counts beside the repository stats, it is working.

## usage

1. go to your github profile or the repositories tab
2. look beside the existing stars and forks
3. click a count to open that repository's issues or pull requests

the script also adds a matching stats row to pinned repositories that do not have stars or forks yet. zero counts are shown too.

## token setup

public repositories work without a token.

for private repositories, open the userscript manager menu and choose **Set GitHub API token**. paste a token that can read the repositories you want to inspect.

the token is stored locally by violentmonkey or tampermonkey and sent only to `api.github.com`.

## customization

use **Replace GitHub API token** or **Clear stored GitHub API token** from the same userscript menu when needed.

## license

mit © microck

## verification

With Node 24.8+, run `npm ci`, `npx e2e-web install chromium`, then `npm run test:e2e`. The pinned tester-army/e2e suite runs the actual userscript in Chromium against isolated repository-card fixtures and a local GM request adapter. It checks pinned/dynamic cards, duplicate-request sharing, pagination, invalid cache/API data and native-link restoration. It does not sign into GitHub, store real tokens, or verify a particular userscript manager's private-repository integration.

Count formatting reuses one formatter, and mutation-root coalescing walks ancestors instead of comparing every pair of added roots. Malformed cached counts are ignored and refetched rather than suppressing cards until expiration.
