# Implementation Details

## Location Tracking

### Location History

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
