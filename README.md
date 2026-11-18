# Tabby Quick Buttons

Hover over the floating button in the lower-right corner of a Tabby terminal to open the command panel. Click an alias to send its saved command to the focused terminal pane.

- **Shared** groups are available in every terminal. Add commands directly or organize them in nested groups.
- **Current profile** groups are available only in the matching Tabby profile. Renaming the profile keeps the association. Temporary connections without a profile ID can use shared groups.
- Select **Manage** to add, edit, or delete commands and groups in the panel. Select **Done** to return to hover mode.
- Each command has a display alias and a single line of terminal text. **Press Enter after inserting** is enabled by default. Turn it off to insert the command for review or editing.

Use shortcuts at an empty shell prompt. The plugin stores commands in Tabby's configuration. Keep passwords and tokens out of command text.

## Install locally

Build the package in the project directory:

```sh
npm ci
npm pack
```

In Tabby, go to **Settings → Plugins** and open the plugin directory. Install the package from that directory using the path to the generated archive:

```sh
npm install /absolute/path/to/tabby-quick-buttons-0.1.0.tgz
```

Quit and reopen Tabby, then open a terminal. The plugin uses the Angular and terminal APIs bundled with Tabby.
