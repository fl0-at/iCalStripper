// T-109 enforce strict typing and get rid of "any" types wherever possible

// Modules to control application life and create native browser window
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { stripICalendarEvents } from './ical-utils';
const path = require('path');
const fs = require('fs').promises;
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

ipcMain.handle("strip-ical-file", async (_, filePath: string, startDate: Date, endDate: Date) => {
	const fileContent = await fs.readFile(filePath, "utf8");
	return stripICalendarEvents(fileContent, startDate, endDate);
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