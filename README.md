# iCalStripper
Create a "stripped" iCal by dragging an iCal file into this tool. Only events within a user-defined date range will be transferred to the new iCal.

## How to use

Drag an iCal file into the drop zone

![image](https://github.com/fl0-at/iCalStripper/assets/2953363/ff958666-e240-4de0-987a-b72b88df499c)

Enter date range of events to keep

![image](https://github.com/fl0-at/iCalStripper/assets/2953363/e382272b-7256-4034-b991-9cf1a9efe3a8)

![image](https://github.com/fl0-at/iCalStripper/assets/2953363/6d94b40d-4ca8-412a-8d59-21602fc22403)

The stripped iCal will be placed in a separate directory called "stripped", at the same path as the file you dropped:

![image](https://github.com/fl0-at/iCalStripper/assets/2953363/e9990653-48a5-475f-a9f6-4406e0948956)

## Want to build for your platform?

Clone the repo and follow these steps:
```
# install dependencies
npm install

# build for Windows
npm run build-win

# build for Mac (untested, I don't have access to a Mac)
npm run build-mac

# build for Linux (only tested on Debian)
npm run build-linux
```
