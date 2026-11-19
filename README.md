# Tabby Quick Buttons

Source code and issue tracker are available on [GitHub](https://github.com/vzpd/tabby-quick-buttons).

Hover over the floating button in a Tabby terminal to open the command panel. The button starts in the lower-right corner. Drag it anywhere in the window to save a new position. Use **Pin** to keep the panel open while you use shortcuts. Click **Pin** again to resume automatic closing.

- **Shared** groups are available in every terminal. Add commands directly or organize them in nested groups.
- **Current profile** groups are available only in the matching Tabby profile. Renaming the profile keeps the association. Temporary connections without a profile ID can use shared groups.
- Select **Manage** to add, edit, or delete commands and groups. Drag a command between other commands to reorder it, or onto a group heading to move it. Dropping onto **Shared** or **Current profile** moves it to the root of that scope and changes where it is available. Select **Done** to return to hover mode.
- Search by alias to find commands across visible groups. In **Manage**, use **Move…** to choose a destination directly from the list.
- The editor shows which profile and group you are working in. Press **Esc** to cancel the current edit and return to the list.
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
npm install /absolute/path/to/tabby-quick-buttons-1.0.7.tgz
```

Quit and reopen Tabby, then open a terminal. The plugin uses the Angular and terminal APIs bundled with Tabby.
