# iCalStripper

Create a "stripped" iCal by dragging an iCal file into this tool. Only events within a user-defined date range will be transferred to the new iCal.

Events are retained as iCalendar components rather than rebuilt from a reduced set of fields. This preserves alarms, attendees, time-zone definitions, and other event properties. Recurring events are expanded within the selected date range and represented as a finite `DTSTART`/`RDATE` set; the original `RRULE` and out-of-range dates are removed. Detached overrides are kept as standalone events when their actual dates are in range. A recurrence producing more than 10,000 occurrences in the selected range, or using `RDATE;VALUE=PERIOD`, is rejected with an explicit error.

## How to use

Drag exactly one local `.ics` or `.ical` file into the drop zone. A valid drop goes directly to the date-range page; it does not open a file-selection dialog. Invalid drops show a message in the drop zone so you can try again without restarting.

![image](https://github.com/fl0-at/iCalStripper/assets/2953363/ff958666-e240-4de0-987a-b72b88df499c)

Enter date range of events to keep

![image](https://github.com/fl0-at/iCalStripper/assets/2953363/e382272b-7256-4034-b991-9cf1a9efe3a8)

![image](https://github.com/fl0-at/iCalStripper/assets/2953363/6d94b40d-4ca8-412a-8d59-21602fc22403)

The stripped iCal will be placed in a separate directory called "stripped", at the same path as the file you dropped:

![image](https://github.com/fl0-at/iCalStripper/assets/2953363/e9990653-48a5-475f-a9f6-4406e0948956)

## Want to build for your platform?

Clone the repo and follow these steps:

```sh
# Requires Node.js >= 22.12.0

# install dependencies
npm ci

# build for Windows (installer)
npm run build-win

# build for Windows (portable)
npm run build-win-portable

# build for Mac (untested, I don't have access to a Mac)
npm run build-mac

# build for Linux
npm run build-linux
```

## Drag-and-drop development and testing

Dropped-file paths are obtained through `webUtils.getPathForFile` in the preload bridge, not the removed Electron `File.path` property. Keep TypeScript's `moduleDetection` set to `legacy`: the renderer is a plain browser script, while the main and preload files use CommonJS. Emitting a CommonJS `exports` reference into the renderer prevents its UI handlers from registering.

Run `npm test` for calendar-conversion tests. Run `npm run test:drag-drop` on a desktop session for the Electron integration test. It sends native file drops through Chromium's debugging protocol, checks that date selection appears without a dialog, checks invalid-drop recovery, and verifies that the saved calendar uses the dropped file's source directory.
