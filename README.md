# Telegram Contact Bot

A Telegram bot built with grammY and Deno to convert phone numbers into interactive contact cards with direct profile links.

## Features

- **Phone to Contact**: Sends a native Telegram Contact card for any provided phone number.
- **Deep Links**: Includes a direct link to the user's Telegram profile.
- **Smart Parsing**: Handles various international and Russian formats (e.g., `8...`, `7...`, `9...`).
- **Inline Mode**: Works in any chat via `@your_bot <number>`.
- **Customization**: Optional flags for `--name` and `--region`.

## Project Structure

- `src/bot/`: Core bot logic and handlers.
- `src/utils/`: Phone parsing and vCard generation.
- `src/config.ts`: Environment configuration.
- `main.ts`: Production entry point (Webhooks).
- `scripts/poll.ts`: Local development helper (Long Polling).

## Setup

1. Create a `.env` file:
   ```env
   BOT_TOKEN=your_token_from_botfather
   PUBLIC_BASE_URL=https://your-domain.deno.dev
   WEBHOOK_PATH_SECRET=random_path_segment
   WEBHOOK_SECRET=random_secret_string
   DEFAULT_REGION=RU
   ```

2. Local Development:
   ```sh
   deno task poll
   ```

3. Run Tests:
   ```sh
   deno task test
   ```

## Deployment

Deploy to Deno Deploy using the provided task:
```sh
deno task deploy:prod
```

Ensure all environment variables are set in your Deno Deploy project dashboard.
