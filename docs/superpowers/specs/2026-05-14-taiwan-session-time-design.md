# Taiwan Session Time Display Design

## Goal

Show session timestamps in the Web Runner Console using Taiwan local time so users in Taiwan can read session history without mentally converting UTC.

## Scope

- Keep persisted timestamps and API payloads in UTC ISO 8601.
- Convert timestamps only in the browser UI.
- Apply the change to the Sessions list first, because this is where the user chooses historical runs.
- Show the source UTC timestamp as hover text for debugging.

## UI Behavior

- The Sessions section displays a small timezone note: `Asia/Taipei (UTC+08:00)`.
- Each session item shows `updatedAt` formatted through `Intl.DateTimeFormat` with `timeZone: "Asia/Taipei"`.
- Each formatted timestamp keeps a `title` value containing the original UTC timestamp.
- Invalid or empty timestamps fall back to the original value instead of throwing.

## Testing

- Add a frontend static regression test to ensure the formatting helper, explicit `Asia/Taipei` timezone, and timezone label remain in the UI.
- Run the existing full test suite after implementation.
