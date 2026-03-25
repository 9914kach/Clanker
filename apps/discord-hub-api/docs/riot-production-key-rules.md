# Riot Games API - production key rules

This project's League of Legends integration must follow Riot's Third Party Developer policies before a production key is requested or used.

This file is a repo-local summary for `discord-hub-api`. It is not a replacement for Riot's Terms of Use or other legal terms. Project owners still need to read and accept Riot's full terms.

## Purpose

The goal of the Riot Games API is to enrich the League of Legends community and improve the player experience. If a feature could create a negative player experience, raise it in the Riot application notes before shipping it.

## Hard rules

Do not:

- Break the law.
- Use Riot's official logos.
- Present the project as partnered with, approved by, or endorsed by Riot Games.
- Publish a project that does not properly secure the API key.
- Use a Development or Interim key for a community-accessible or public project.
- Use one Production key across multiple projects. Each project needs its own approved application.
- Compromise competitive integrity or create unfair player advantages.
- Charge money for the app, or gate any part of it behind exclusive paid access.
- Shame players based on performance or any other metric.
- Provide alternate channels for reporting or evaluating other players.
- Create unofficial replacements for Riot's skill/ranking systems, including MMR or Elo calculators.
- Connect to League of Legends systems that are not part of Riot's documented third-party tools.
- Scrape undocumented endpoints or use data sources outside Riot's documented APIs and approved tools.
- Build tools or UI that imitate Riot or League client branding/designs in or out of game.

## Encouraged directions

Riot explicitly likes projects that:

- Think outside the box.
- Help players connect with friends.
- Help players evaluate and improve their own gameplay.
- Use in-game art assets where allowed, but not official Riot logos.

## Clanker-specific notes

For this repository, a Riot production key should only be used for the `discord-hub-api` project that exposes the League integration endpoints.

- Keep the real key in environment variables only. Never commit it.
- Do not reuse the same production key for other apps in this monorepo unless Riot has separately approved them as the same project.
- Treat any public deployment as production-policy scope, even if the feature set is small.
- If a planned feature feels like a gray area, document the intent and ask Riot in the application notes before launch.

## Before registering or using a production key

Confirm all of the following:

- The project owner has read Riot's full terms and policy pages.
- The app secures the Riot API key and does not expose it to the client.
- The project uses only documented Riot endpoints and tools.
- The project does not monetize access or create exclusive gameplay advantages.
- The project does not shame players or recreate unofficial ranking systems.
- The project owner agrees to abide by Riot's Third Party Developer requirements.
