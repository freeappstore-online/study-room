# Study Room User Guide

This guide explains how to use Study Room as a learner, group member, or room host.

## 1. Home Page

The home page has three main actions:

- `Create a room` starts a new study room.
- `Join a room` opens the join form for a room link or room code.
- `Saved posts` opens your personal saved discussion posts.

You do not need an account for basic guest rooms. Signing in is useful when you want FreeAppStore-powered live room sync across devices.

## 2. Create A Room

1. Click `Create a room`.
2. Enter a room name.
3. Enter your display name.
4. Choose focus and break durations.
5. Click `Create room`.

The creator becomes the room host. The host controls the shared timer and can close the room.

## 3. Invite Friends

Inside a room, click `Invite`.

You can share either:

- Room link: best for full room metadata and reconnect behavior.
- Room code: useful when someone wants to enter the code manually.

Friends can join without creating an account.

## 4. Join A Room

1. Click `Join a room`.
2. Choose `By link` or `By code`.
3. Paste the room link or enter the room code.
4. Enter your display name.
5. Click `Join room`.

If you join by link, the app can also receive room metadata such as room name, timer settings, and shared registry ID when available.

## 5. Use The Shared Timer

The timer follows a focus/break rhythm.

Only the host can:

- Start or pause the timer.
- Reset the timer.
- Skip to the next session.

Members can watch the shared timer and update their own status.

## 6. Set Your Status

Use the status buttons in the members panel:

- `Focus`
- `Break`
- `Away`

Status is visible to people in the same room. It helps the group understand who is actively studying, taking a break, or unavailable.

## 7. Room Goal

The room host can edit the room goal.

Use this for a short shared intention, for example:

```text
Finish one focused session and resolve open assignment questions.
```

## 8. Discussion Board

The discussion board is for async study questions and useful resources, not live chat.

Use it for:

- Questions you are stuck on.
- Useful resources.
- Study notes.
- Other room-relevant information.

Post categories are:

- `Question`
- `Resource`
- `Study note`
- `Other`

## 9. Create A Discussion Post

1. Open the discussion board.
2. Click `New post`.
3. Enter a title.
4. Choose a category.
5. Write the post content.
6. Click `Post to board`.

Other room members can open the post and reply.

## 10. Reply To A Post

1. Open a discussion post.
2. Write a focused reply.
3. Click `Reply`.

Replies are synced in the room. If you have saved the post, your saved copy continues updating while you are still in the room.

## 11. Save Useful Posts

Use `Save` on a discussion post when you want to keep it after leaving the room.

Saved posts are personal. They are not visible to other room members.

A saved post includes:

- Room name and room code.
- Category.
- Title.
- Main content.
- Author.
- Created time.
- Saved time.
- Last synced time.
- Replies.

If you save a post when it has one reply and later the room post gets more replies, the saved copy updates while you remain in the room.

## 12. View Saved Posts

You do not need to enter a room to view saved posts.

1. Return to the home page.
2. Click `Saved posts`.
3. Click a saved post card to open its full detail view.
4. Use the checkbox on the left of a saved post card to include or exclude it from Markdown export.

The checkbox selects the post for export. Clicking the post itself opens the full saved detail.

## 13. Export Saved Posts As Markdown

Saved posts can be copied as Markdown.

1. Open `Saved posts`.
2. Select the posts you want to export.
3. Click `Copy selected Markdown`.
4. Paste into your notes app, Markdown editor, Word, Notion, Obsidian, or another document.

Use `Select all` to select every saved post. When every post is selected, the button changes to `Clear selection`.

The exported Markdown includes the post metadata, original post content, and replies.

## 14. Personal Tasks

Open `My tasks` inside a room.

Tasks are personal and visible only on your device. Use them for small session goals, such as:

- Finish reading section 3.
- Debug OAuth callback.
- Write assignment outline.

## 15. Leave Or Close A Room

The available exit action depends on your role.

- Host: `Close room`
- Non-host member: `Leave`

If a member leaves, the room remains open.

If the host closes the room, everyone receives a room closed message and is returned to the home page.

## 16. Accidental Tab Close And Reconnect

Closing the browser tab by accident does not close the room.

If you reopen the app in the same browser, the app can restore the active room from local state.

Signed-in rooms also use a host heartbeat. If the host is away for longer than the reconnect grace period, the room can be treated as expired. The current grace period is 30 minutes.

## 17. Recommended Workflow

For a study group:

1. Host creates a room.
2. Host invites friends.
3. Everyone sets status to `Focus`.
4. Host starts the timer.
5. Members post questions or useful resources on the discussion board.
6. Members reply asynchronously.
7. Save useful posts.
8. After the session, export selected saved posts as Markdown.
9. Host closes the room when the study session is finished.

## 18. Notes And Limitations

- Saved posts are currently stored in browser local storage.
- Personal tasks are stored locally on the device.
- Export currently copies Markdown to the clipboard rather than creating a file.
- PDF export is not included yet.
- Joining by full room link provides the best metadata and reconnect behavior.
