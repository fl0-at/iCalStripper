// T-109 enforce strict typing and get rid of "any" types wherever possible

// Modules to control application life and create native browser window
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import {
	collectICalEvents,
	getICalProperty,
	isICalEventWithinRange,
	normalizeICalContent,
	parseICalDate,
	toICalBuilderDate
} from './ical-utils';
const path = require('path');
const fs = require('fs').promises;
const icalToolKit = require('ical-toolkit');
const jsonLogger = require('console-log-json');
const pth = require('path');
const { autoUpdater } = require("electron-updater");

jsonLogger.LoggerAdaptToConsole();

let newFilePath:string;

app.on("ready", () => {
    autoUpdater.checkForUpdatesAndNotify();
});
function setFilePath(filePath:string) {
    newFilePath = filePath;
};

async function createWindow() {
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
		icon: 'resources/icon.ico',
		webPreferences: {
			sandbox: false,
			preload: path.join(__dirname, 'preload.js'),
		}
	});

	// hide menu bar	
	mainWindow.setMenuBarVisibility(false);

	// and load the index.html of the app.
	await mainWindow.loadFile('build/index.html');

	// Open the DevTools.
	//mainWindow.webContents.openDevTools();

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
ipcMain.handle("is-iCal", async (_, fileType: string, fileName: string) => {
	const supportedTypes = ["text/calendar", "application/ics", "application/x-ical", "text/x-vcalendar"];
	const extension = pth.extname(fileName).toLowerCase();
	return supportedTypes.includes(fileType.toLowerCase()) || extension === ".ics" || extension === ".ical";
})

// get file contents - only used for debugging
ipcMain.handle("get-file-content", async (_, path) => {
	return await (await fs.readFile(path)).toString();
})

// convert ICS to JSON
ipcMain.handle("convert-ics-to-json", async (_, path) => {
	const icsRes = await path;
	const fileContent = await fs.readFile(icsRes, "utf8");
	const json = icalToolKit.parseToJSON(normalizeICalContent(fileContent));
	if (json instanceof Error) throw json;
	if (!json || !Array.isArray(json.VCALENDAR) || json.VCALENDAR.length === 0) {
		throw new Error("The selected file does not contain a valid iCalendar.");
	}
	const calendar = json.VCALENDAR[0];
	if (typeof calendar.VERSION !== "string" || typeof calendar.PRODID !== "string") {
		throw new Error("The iCalendar is missing the required VERSION or PRODID property.");
	}
	return json;
})

// strip the jCal
ipcMain.handle("strip-jcal", async (_, jCal, startDate, endDate) => {
	const newCal: any = { VCALENDAR: jCal.VCALENDAR, VEVENT: [] };
	const events = collectICalEvents(jCal);
	const startBoundary = new Date(startDate);
	const endBoundary = new Date(endDate);

	for (const event of events) {
		const startProperty = getICalProperty(event, "DTSTART");
		if (!startProperty) throw new Error("An iCalendar event is missing DTSTART.");
		const eventStart = parseICalDate(startProperty);

		const endProperty = getICalProperty(event, "DTEND");
		const eventEnd = endProperty
			? parseICalDate(endProperty)
			: { ...eventStart, date: new Date(eventStart.date) };
		if (eventStart.allDay !== eventEnd.allDay) {
			throw new Error("An iCalendar event must use matching date types for DTSTART and DTEND.");
		}
		if (!endProperty && eventStart.allDay) {
			eventEnd.date.setDate(eventEnd.date.getDate() + 1);
		}

		if (isICalEventWithinRange(eventStart, eventEnd, startBoundary, endBoundary)) {
			newCal.VEVENT.push(event);
		}
	}

	const newJCal = JSON.parse(JSON.stringify(newCal));

	return newJCal;

}) 

// convert JSON to ICS
ipcMain.handle("convert-json-to-ics", async (_, jCal_stripped) => {

	// create iCalFileBuilder
	let newICal = icalToolKit.createIcsFileBuilder();

	// specify settings for builder - here's possible settings:
	//newICal.spacers = true; //Add space in ICS file, better human reading. Default: true
	//newICal.NEWLINE_CHAR = '\r\n'; //Newline char to use.
	//newICal.throwError = false; //If true throws errors, else returns error when you do .toString() to generate the file contents.
	//newICal.ignoreTZIDMismatch = true; //If TZID is invalid, ignore or not to ignore!

	/* loop through contents of stripped jCal and add to builder */
	for (let entry in jCal_stripped) {		
		if (entry === "VCALENDAR") {

			// fill in all the calendar specific info
			let infObj = jCal_stripped[entry];

			for (let indexPos in infObj) {
				
				let curObj = infObj[indexPos];
				const getCalendarValue = (propertyName: string) => getICalProperty(curObj, propertyName)?.value;
				const prodid = getCalendarValue("PRODID");
				const version = getCalendarValue("VERSION");
				const calscale = getCalendarValue("CALSCALE");
				const method = getCalendarValue("METHOD");
				const calname = getCalendarValue("X-WR-CALNAME");
				const description = getCalendarValue("X-WR-CALDESC");
				const timezone = getCalendarValue("X-WR-TIMEZONE");

				if (prodid) newICal.prodid = prodid;
				if (version) newICal.version = version;
				if (calscale) newICal.calscale = calscale;
				if (method) newICal.method = method;
				if (calname) newICal.calname = calname;
				newICal.additionalTags = description ? { 'X-WR-CALDESC': description } : {};
				newICal.timezone = timezone;
				newICal.tzid = timezone;
			}				
		} else if (entry === "VEVENT") {

			// add each event to the iCal
			let eventObj = jCal_stripped[entry];

			for (let indexPos in eventObj) {

				let curEvent = eventObj[indexPos];				
				const startProperty = getICalProperty(curEvent, "DTSTART");
				const endProperty = getICalProperty(curEvent, "DTEND");
				if (!startProperty) throw new Error("An iCalendar event is missing DTSTART.");
				const eventStart = parseICalDate(startProperty);
				const eventEnd = endProperty
					? parseICalDate(endProperty)
					: { ...eventStart, date: new Date(eventStart.date) };
				if (!endProperty && eventStart.allDay) {
					eventEnd.date.setDate(eventEnd.date.getDate() + 1);
				}
				if (eventStart.allDay !== eventEnd.allDay) {
					throw new Error("An iCalendar event must use matching date types for DTSTART and DTEND.");
				}
				const getValue = (propertyName: string) => getICalProperty(curEvent, propertyName)?.value;
				const stampProperty = getICalProperty(curEvent, "DTSTAMP");
				const additionalTags: Record<string, string> = {};
				const created = getValue("CREATED");
				const lastModified = getValue("LAST-MODIFIED");
				if (created) additionalTags.CREATED = created;
				if (lastModified) additionalTags["LAST-MODIFIED"] = lastModified;

				newICal.events.push({
					start: toICalBuilderDate(eventStart),
					end: toICalBuilderDate(eventEnd),
					stamp: stampProperty ? toICalBuilderDate(parseICalDate(stampProperty)) : undefined,
					uid: getValue("UID"),
					description: getValue("DESCRIPTION"),
					location: getValue("LOCATION"),
					sequence: getValue("SEQUENCE"),
					status: getValue("STATUS"),
					summary: getValue("SUMMARY"),
					transp: getValue("TRANSP"),
					allDay: eventStart.allDay,
					floating: eventStart.floating,
					additionalTags
				});
			}

		}

	}

	// build iCal File
	const generatedContent = newICal.toString();
	if (generatedContent instanceof Error) throw generatedContent;
	const icsFileContent = generatedContent.replaceAll('\\\\n', '\\n').replaceAll('\\\\\\', '').replaceAll('\\\\', '');

	return icsFileContent;
}) 


ipcMain.handle("save-file-to-disk", async (_, path, name, data, format) => {

	const orgPath = await path;
	const directory = pth.dirname(orgPath);

	let filename = '';

	if (name === '') {
		const { generate: randWords } = await import('random-words');
		const randString = randWords({ exactly: 2, join: '' })
		filename = randString + "." + format;
	} else {
		let todayDateISO = new Date().toISOString();
		filename = name.replace(pth.extname(path), '') + "_stripped_" + todayDateISO.substring(0,todayDateISO.indexOf('T'));
		filename = filename + "." + format;
	}

	const newDir = pth.join(directory, "stripped");
	await fs.mkdir(newDir, { recursive: true });

	let newPath = pth.join(newDir, filename);
	let suffix = 2;

	while (true) {
		try {
			await fs.writeFile(newPath, data, { flag: "wx" });
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

			const extension = pth.extname(filename);
			const baseName = filename.slice(0, -extension.length);
			newPath = pth.join(newDir, `${baseName}_${suffix}${extension}`);
			suffix += 1;
		}
	}

	setFilePath(newPath);

	return newPath;
})

ipcMain.handle("getNewFilePath", async () => {
	const fp = await newFilePath;
	return pth.normalize(fp);
})

ipcMain.handle("open-file-path", async (_, path) => {

	shell.showItemInFolder(path);
	
})

ipcMain.handle("relaunch-app", () => {
	let opt:any = {};
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