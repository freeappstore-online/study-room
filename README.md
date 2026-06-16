# Study Room

A quiet shared Pomodoro room for focused study sessions on [FreeAppStore](https://freeappstore.online).

Study Room is designed for small groups who want accountability without a noisy chat or video call. A room gives everyone the same focus/break rhythm, lightweight presence, an async discussion board, private personal tasks, and saved discussion notes that can be exported as Markdown.

- App: `study-room`
- Subdomain: `study-room.freeappstore.online`
- License: MIT
- Tracking: none

## Features

- Create or join a study room by link or room code.
- Shared Pomodoro timer controlled by the room host.
- Member presence with `Focus`, `Break`, and `Away` states.
- Room goal editable by the host.
- Async discussion board for questions, resources, notes, and other useful posts.
- Replies on discussion posts.
- Personal task list stored locally on the user's device.
- Invite modal with copyable room link and room code.
- Host-only `Close room`; other members use `Leave`.
- Room recovery after refresh or accidental tab close.
- Signed-in rooms use a lightweight shared registry so closed or expired rooms can be detected after reconnect.
- Saved posts available from the home page, independent of the current room.
- Select saved posts and copy them as Markdown for external notes.

## Room Lifecycle

Only the host can close a room.

- If the host clicks `Close room`, the app broadcasts a close event and marks the shared room registry as closed when available.
- If a participant clicks `Leave`, only that participant exits.
- Accidental tab close, refresh, or short network interruption does not close the room.
- The host can reopen the app in the same browser and return to the active room from local state.
- Signed-in rooms use a host heartbeat. If the host does not reconnect within the grace period, the room is treated as expired.

The current host reconnect grace period is 30 minutes.

## Saved Posts

Saved posts are global personal notes, not room-only state.

- Open `Saved posts` from the home page.
- Save useful discussion posts from the discussion board or post detail modal.
- Saved posts include the room name, room code, category, title, body, author, timestamps, and replies.
- While the user remains in the room, saved copies continue syncing with the live post, so new replies are captured.
- After the room closes, the saved copy remains available.
- Select saved posts and use `Copy selected Markdown` to paste into a Markdown editor, Word, Notion, Obsidian, or another notes app.

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS v4
- `@freeappstore/sdk`
- `vite-plugin-pwa`

## Development

Install dependencies:

```bash
pnpm install
```

Run the app locally:

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
```

Run type checks:

```bash
pnpm typecheck
```

Preview the production build:

```bash
pnpm preview
```

## Project Structure

```text
web/
  index.html
  package.json
  src/
    App.tsx
    index.css
    main.tsx
    types.ts
    hooks/
      useRoomChannel.ts
      useStoredState.ts
```

## Data And Privacy

Study Room does not add tracking.

Guest rooms work with local browser state and real-time room messages. Signed-in rooms can use FreeAppStore services for cross-device live room messaging and the shared room registry used to detect closed or expired rooms.

Saved posts and personal tasks are personal data. The current implementation stores them in browser local storage.

## User Guide

See [USER_GUIDE.md](./USER_GUIDE.md) for a step-by-step guide to creating rooms, joining rooms, posting discussions, saving posts, and exporting Markdown.

## Deployment

Deployment follows the FreeAppStore repository convention:

```bash
git push origin main
```

The production deployment is handled by GitHub Actions.

## License

MIT. See [LICENSE](./LICENSE).
