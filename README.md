# GitHub Repository Card Open Counts

Tampermonkey/Violentmonkey userscript that adds open issue and pull request counts to GitHub repository cards, including profile pins and the repositories tab.

![GitHub repository cards showing open issue and pull request counts](./screenshot.png)

## Features

- Shows open issue and pull request counts beside GitHub's existing repository stats
- Uses GitHub's native issue and pull request icons
- Works on profile pins and the repositories tab, including repositories with zero counts
- Handles cards that GitHub loads after the page opens
- Caches counts for 10 minutes per tab
- Supports an optional GitHub token for private repositories and higher API limits

## Installation

1. Install [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/).
2. Open [github-repository-card-open-counts.user.js](https://raw.githubusercontent.com/Microck/github-repository-card-open-counts/main/github-repository-card-open-counts.user.js).
3. Confirm the installation.
4. Open a GitHub profile or repositories page and refresh it.

## Token setup

For private repositories, open the userscript manager menu and choose **Set GitHub API token**.

Paste a token that can read the repositories you want to inspect. The token is stored in the userscript manager and sent only to `api.github.com`.

Use **Replace GitHub API token** or **Clear stored GitHub API token** from the same menu when needed.

## Usage

Counts appear beside the existing stars and forks. Pinned repositories without those stats get a matching metadata row.

Click an issue or pull request count to open that repository's corresponding GitHub page.

## Notes

- Public repositories work without a token.
- GitHub counts pull requests as issues, so the script subtracts open pull requests from the combined issue total.
- If the API request fails, the script leaves GitHub's native links intact.

## License

MIT © Microck
