// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fs_2 = require('fs');
const icalToolKit = require('ical-toolkit');
const jsonLogger = require('console-log-json');
const pth = require('path');
const randWords = require('random-words');
const { shell } = require('electron');

jsonLogger.LoggerAdaptToConsole();

var newFilePath;

function setFilePath(filePath) {
    newFilePath = filePath;
};

function createWindow() {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 680,
        height: 480,
        minWidth: 320,
        minHeight: 256,        
        title: 'iCal Stripper ' + app.getVersion(),
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#000000',
            symbolColor: '#ffffff'
        },
        backgroundColor: '#000000',
        icon: 'resources\icon.ico',
        webPreferences: {
            sandbox: false,
            preload: path.join(__dirname, 'preload.js'),
        }
    });

    // hide menu bar    
    mainWindow.setMenuBarVisibility(false)

    // and load the index.html of the app.
    mainWindow.loadFile('index.html')

    // Open the DevTools.
    //mainWindow.webContents.openDevTools()
}

function iCalDateToDateTime(iCalDateString) {

    // icalStr = '20110914T184000Z'             
    var y = iCalDateString.substr(0, 4);
    var m = parseInt(iCalDateString.substr(4, 2), 10) - 1;
    var d = iCalDateString.substr(6, 2);
    var h = iCalDateString.substr(9, 2);
    var min = iCalDateString.substr(11, 2);
    var sec = iCalDateString.substr(13, 2);

    var dateTime = new Date(y, m, d, h, min, sec);

    return dateTime;

}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    createWindow()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// check if a file or directory was dropped
ipcMain.handle("is-file", async (_, path) => {
    const res = await fs.lstat(path);
    return res.isFile();
})

// check if the dropped file is an iCal file
ipcMain.handle("is-iCal", async (_, fileType) => {
    return fileType === "text/calendar" ? true : false;
})

// get file contents - only used for debugging
ipcMain.handle("get-file-content", async (_, path) => {
    return await (await fs.readFile(path)).toString();
})

// convert ICS to JSON
ipcMain.handle("convert-ics-to-json", async (_, path) => {
    const icsRes = await path;
    // Convert
    const json = await icalToolKit.parseFileToJSONSync(icsRes);
    return json;
})

// strip the jCal
ipcMain.handle("strip-jcal", async (_, jCal, startDate, endDate) => {    
    const newCal = {}; // declare new calendar obj
    /* loop through the jCal and strip unwanted events */
    for (var entry in jCal) {
//        console.log(attributename + ": " + myobject[attributename]);
        if (entry === "VCALENDAR") {
            //newCal.push(entry, jCal[entry]);
            newCal[entry] = jCal[entry];
        } else if (entry === "VEVENT") {

            // every event is itself an object with a numerical index
            var eventObj = jCal[entry];

            // each of those event objects contains an array of key - value pairs
            var newEventArr = [];
            for (var indexPos in eventObj) {
                var curEvent = eventObj[indexPos];
                var eventStartDate = null;
                var eventEndDate = null;
                // loop through each event's attributes to determine its start and end date
                for (var attributeName in curEvent) {
                    // determine whether to keep the event or not
                    switch (attributeName) {
                        case 'DTSTART':
                            eventStartDate = iCalDateToDateTime(curEvent[attributeName]);
                            break;
                        case 'DTEND':
                            eventEndDate = iCalDateToDateTime(curEvent[attributeName]);
                            break;
                        default:
                            break;
                    }
                }
                // finished looping through attributes - now either in- or exclude event
                if (eventStartDate >= startDate && eventEndDate <= endDate) {
                    // we want to keep this one, since it is within our boundaries
                    newEventArr.push(curEvent);
                }                              
            }

            newCal[entry] = newEventArr;
        }
        
    }

    const newJCal = JSON.parse(JSON.stringify(newCal));
    return newJCal;

}) 

// convert JSON to ICS
ipcMain.handle("convert-json-to-ics", async (_, jCal_stripped) => {

    // create iCalFileBuilder
    var newICal = icalToolKit.createIcsFileBuilder();

    // specify settings for builder - here's possible settings:
    //newICal.spacers = true; //Add space in ICS file, better human reading. Default: true
    //newICal.NEWLINE_CHAR = '\r\n'; //Newline char to use.
    //newICal.throwError = false; //If true throws errors, else returns error when you do .toString() to generate the file contents.
    //newICal.ignoreTZIDMismatch = true; //If TZID is invalid, ignore or not to ignore!

    /* loop through contents of stripped jCal and add to builder */
    for (var entry in jCal_stripped) {        
        if (entry === "VCALENDAR") {

            // fill in all the calendar specific info
            var infObj = jCal_stripped[entry];

            for (var indexPos in infObj) {
                
                var curObj = infObj[indexPos];

                newICal.prodid = curObj['PRODID'];
                newICal.version = curObj['VERSION'];
                newICal.calscale = curObj['CALSCALE'];
                newICal.method = curObj['METHOD'];
                newICal.calname = curObj['X-WR-CALNAME'];
                newICal.additionalTags = {
                    'X-WR-CALDESC': curObj['X-WR-CALDESC']
                };
                newICal.timezone = curObj['X-WR-TIMEZONE'];
                newICal.tzid = curObj['X-WR-TIMEZONE'];
            }              
        } else if (entry === "VEVENT") {

            // add each event to the iCal
            var eventObj = jCal_stripped[entry];

            for (var indexPos in eventObj) {

                var curEvent = eventObj[indexPos];                

                newICal.events.push({
                    start: iCalDateToDateTime(curEvent['DTSTART']),
                    end: iCalDateToDateTime(curEvent['DTEND']),
                    stamp: iCalDateToDateTime(curEvent['DTSTAMP']),
                    uid: curEvent['UID'],
                    description: curEvent['DESCRIPTION'],
                    location: curEvent['LOCATION'],
                    sequence: curEvent['SEQUENCE'],
                    status: curEvent['STATUS'],
                    summary: curEvent['SUMMARY'],
                    transp: curEvent['TRANSP'],
                    additionalTags: {
                        'CREATED': curEvent['CREATED'],
                        'LAST-MODIFIED': curEvent['LAST-MODIFIED']
                    }
                });
            }

        }

    }

    // build iCal File
    var icsFileContent = newICal.toString().replaceAll('\\\\n', '\\n').replaceAll('\\\\\\', '').replaceAll('\\\\', '');
    // had to replace some escape characters as this is apparently neither handled by iCalToolkit nor by ical2json which it relies on

    // check for any errors
    if (icsFileContent instanceof Error) {
        console.log('Returned Error, either handle it yourself somehow or configure to throw errors!');
        // handle error somehow...
    }

    return icsFileContent;
}) 


ipcMain.handle("save-file-to-disk", async (_, path, name, data, format) => {

    const orgPath = await path;
    const directory = pth.dirname(orgPath);

    var filename = '';

    if (name === '') {
        const randString = randWords({ exactly: 2, join: '' })
        filename = randString + "." + format;
    } else {
        var todayDateISO = new Date().toISOString();
        filename = name.replace(pth.extname(path), '') + "_stripped_" + todayDateISO.substring(0,todayDateISO.indexOf('T'));
        filename = filename + "." + format;
    }

    const newDir = directory + "/stripped/";

    if (!(fs_2.existsSync(newDir))) {
        fs.mkdir(newDir);        
    }

    const newPath = newDir + filename;

    setFilePath(newPath);
    const saveFile = await fs.writeFile(newPath, data);

    return saveFile;
})

ipcMain.handle("getNewFilePath", async () => {
    const fp = await newFilePath;
    return pth.normalize(fp);
})

ipcMain.handle("open-file-path", async (_, path) => {

    shell.showItemInFolder(path);
    
})

ipcMain.handle("relaunch-app", () => {
    var opt = {};
    opt.args = process.argv.slice(1).concat(['--relaunch']);
    opt.execPath = process.execPath;
    if (app.isPackaged && process.env.PORTABLE_EXECUTABLE_FILE != undefined) {
        opt.execPath = process.env.PORTABLE_EXECUTABLE_FILE;
    }
    app.relaunch(opt);
    app.exit();
})

ipcMain.handle("close-app", () => {
    app.quit();
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.