# grandfilenavigator README

Activating the extension will enable a new sidebar view in which a histogram and hotspot view (for the visited locations) are available.

## Development

See `vsc-extension-quickstart.md` for running and debugging the extension.

For debugging webviews specifically, use the `Developer: Toggle Developer Tools` command to inspect and debug any webviews.

To package the extension, execute `npm install -g @vscode/vsce` and then `vsce package`.

## Features

### Navigation

Two commands to jump between tracked locations can be bound to key combinations: grandfilenavigator.jumpBackwards and grandfilenavigator.jumpForwards
They execute the same command as clicking the backwards/forwards buttons in the visualization.
The jump locations are also visible in the histogram sidebar: lightblue circles for previous locations, green ones for next locations (if any).

## Requirements

No reqs.

## Extension Settings

Nothing
