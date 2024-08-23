# Implementation Details

## Position Tracking

### Position History

The location history can be obtained by calling `getPositionHistory` from `src/location-tracking.ts`. Using `savePositionHistory` it can be stored to a file location (usually the extension storage), and loaded again using `loadPositionHistory`.

### Data Structure

The location history is structured as nested objects (of type PositionHistory), with each field representing a directory/file, and the objects representing files containing an array of RangeData objects (with range of visible lines and the duration for which they were shown).
For example, if the user viewed file `path/to/file.java`, lines 20-40 for 5 seconds and file `path/thats/different.java`, lines 1-15 twice for 1s each, the location history would be `{"path": {"to": {"file.java": [{"startLine": 20,"endLine": 40,"totalDuration": 5000}]}, "thats": {"different.java": [{"startLine": 1, "endLine": 15, "totalDuration": 2000}]}}}`.

### Control Flow

The lcoation tracking is implemented in `src/location-tracking.ts`.
Whenever the editor location changes (open/focused file changes, scrolling), `updateLocationTracking` is called from the main extension file.
There it is first determined if the tracking should be updated, based on the **previously open** file (is file with correct language, and last update was >100ms ago to handle scrolling).
If the tracking should be updated, the location history is updated with the file path, the visible range (lines in the editor) and the duration for which it was visible.
After that, it is determined if the **current** file should be tracked. This is necessary because the location tracking is notified of view changes only after they happened. This is used to determine after the next view update if the previous location should be tracked or not.

## Sidebar History View

### View Properties

To show the position history and enable simple navigations, the `HotspotsProvider` was implemented. It takes the position history described above and transforms it into a tree view, which can then be viewed on the side in the Explorer (under `File Hotspots`). Clicking an entry expands it, showing the contained nodes (i.e., the subdirectories, files and indivudual ranges of the position history).

### Hotspots Provider

On initial opening, the HotspotsProvider loads the positionHistory using `getPositionHistory`. All entries are then recursively converted as follows: If it's a directory, the path to it is reconstructed and used as display name (gets shown in sidebar). If it's a file with position data, a leaf node is created for each range.
On each file node, the total duration spent in it is accumulated and shown beside the path.

### Control Flow

This view is defined in `package.json` and registered in the main extension file. The main extension file also registers the refresh command, which reloads the tree.

## Webview Visualization (WIP)

### Overview

The webview can be displayed as a separate panel/window in the editor, and can contain arbitrary html/css/js. This would allow it to show a more complex graphical representation of the position history. It is a bit more complex, as it cannot be directly addressed form the main extension. Instead messages need to be passed from/to the webview.
