const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { app } = require("electron");

app.setAppPath(path.resolve(__dirname, "../.."));
const directory = process.argv[2];
assert.ok(directory, "A temporary test directory is required");
const profile = path.join(directory, "profile");
require("node:fs").mkdirSync(profile);
app.setPath("userData", profile);
app.setPath("sessionData", profile);
app.disableHardwareAcceleration();

async function waitForState(contents, expression) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await contents.executeJavaScript(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    const errors = await contents.executeJavaScript(`({
        errors: window.dropErrors, events: window.dropEvents,
        text: document.getElementById("dropzone").textContent,
        modal: document.getElementById("infotext").textContent
    })`);
    throw new Error(`Timed out waiting for ${expression}: ${JSON.stringify(errors)}`);
}

async function dropFiles(contents, files) {
    const point = await contents.executeJavaScript(`(() => {
        const bounds = document.getElementById("dropzone").getBoundingClientRect();
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    })()`);
    const data = { items: [], files, dragOperationsMask: 1 };
    for (const type of ["dragEnter", "dragOver", "drop"]) {
        await contents.debugger.sendCommand("Input.dispatchDragEvent", { type, ...point, data });
    }
}

const loaded = new Promise(resolve => {
    app.once("browser-window-created", (_, window) => {
        window.webContents.once("did-finish-load", () => resolve(window));
    });
});
require("../../build/main.js");

(async () => {
    try {
        const calendarPath = path.join(directory, "calendar.ics");
        await fs.writeFile(calendarPath, [
            "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//iCalStripper drop test//EN", "BEGIN:VEVENT",
            "UID:drop-test", "DTSTART:20261101T090000Z",
            "END:VEVENT", "END:VCALENDAR", ""
        ].join("\r\n"));

        const window = await loaded;
        const contents = window.webContents;
        const dialogs = [];
        contents.debugger.attach("1.3");
        contents.debugger.on("message", (_, method, params) => {
            if (method === "Page.javascriptDialogOpening") {
                dialogs.push(params.message);
                contents.debugger.sendCommand("Page.handleJavaScriptDialog", { accept: false });
            }
        });
        await contents.debugger.sendCommand("Page.enable");
        await contents.executeJavaScript(`
            window.dropErrors = [];
            window.dropEvents = [];
            for (const type of ["dragenter", "dragover", "drop"]) {
                document.addEventListener(type, event => window.dropEvents.push({
                    type, target: event.target.id, files: event.dataTransfer?.files.length
                }), true);
            }
            window.addEventListener("unhandledrejection", event => {
                window.dropErrors.push(String(event.reason));
            });
            window.addEventListener("error", event => {
                window.dropErrors.push(event.message);
            });
        `);

        assert.equal(await contents.executeJavaScript(`(() => {
            const event = new DragEvent("drop", { bubbles: true, cancelable: true });
            document.body.dispatchEvent(event);
            return event.defaultPrevented;
        })()`), true);

        const invalidPath = path.join(directory, "not-a-calendar.txt");
        await fs.writeFile(invalidPath, "not a calendar");
        await dropFiles(contents, [invalidPath]);
        await waitForState(contents, 'document.getElementById("dropzone").textContent.includes("valid iCal")');
        assert.equal(await contents.executeJavaScript('getComputedStyle(document.querySelector(".bg-modal")).display'), "none");

        await dropFiles(contents, [calendarPath, invalidPath]);
        await waitForState(contents, 'document.getElementById("dropzone").textContent.includes("exactly one")');
        assert.equal(await contents.executeJavaScript('getComputedStyle(document.querySelector(".bg-modal")).display'), "none");

        await contents.executeJavaScript(`(() => {
            const transfer = new DataTransfer();
            transfer.items.add(new File(["BEGIN:VCALENDAR"], "virtual.ics", { type: "text/calendar" }));
            document.getElementById("dropzone").dispatchEvent(new DragEvent("drop", {
                bubbles: true, cancelable: true, dataTransfer: transfer
            }));
        })()`);
        await waitForState(contents, 'document.getElementById("dropzone").textContent.includes("no local file path")');
        assert.equal(await contents.executeJavaScript('getComputedStyle(document.querySelector(".bg-modal")).display'), "none");

        // A valid drop must work after errors, without restarting the app.
        await dropFiles(contents, [calendarPath]);
        await waitForState(contents, 'getComputedStyle(document.getElementById("afterDrop")).display === "flex"');
        const state = await contents.executeJavaScript(`({
            before: getComputedStyle(document.getElementById("beforeDrop")).display,
            after: getComputedStyle(document.getElementById("afterDrop")).display,
            form: getComputedStyle(document.getElementById("stripParams")).display,
            modal: getComputedStyle(document.querySelector(".bg-modal")).display,
            date: document.getElementById("dateRangePicker").value,
            submitDisabled: document.getElementById("submit").disabled,
            pickerVisible: Boolean(document.querySelector(".air-datepicker.-active-")),
            errors: window.dropErrors
        })`);
        assert.deepEqual(state.errors, []);
        assert.deepEqual(dialogs, []);
        assert.equal(state.before, "none");
        assert.equal(state.form, "flex");
        assert.equal(state.modal, "none");
        assert.equal(state.submitDisabled, false);
        assert.match(state.date, /^\d{2}\.\d{2}\.\d{4} - \d{2}\.\d{2}\.\d{4}$/);
        assert.equal(state.pickerVisible, false);

        await contents.executeJavaScript(`
            document.getElementById("dateRangePicker").value = "01.11.2026 - 02.11.2026";
            document.getElementById("stripParams").requestSubmit();
        `);
        await waitForState(contents, 'getComputedStyle(document.querySelector(".bg-modal")).display === "flex"');
        const savedPath = await contents.executeJavaScript('document.getElementById("path").textContent');
        assert.equal(path.dirname(savedPath), path.join(directory, "stripped"));
        assert.match(await fs.readFile(savedPath, "utf8"), /UID:drop-test/);
        assert.equal((await fs.readdir(path.join(directory, "stripped"))).length, 1);
        assert.deepEqual(dialogs, []);
        assert.deepEqual(await contents.executeJavaScript("window.dropErrors"), []);

        console.log("Electron drag-and-drop passed");
        app.exit(0);
    } catch (error) {
        console.error(error);
        app.exit(1);
    }
})();
