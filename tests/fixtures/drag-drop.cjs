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

async function key(contents, value, modifiers = 0) {
    const codes = { Enter: 13, Tab: 9, Escape: 27, ArrowRight: 39, PageUp: 33, PageDown: 34, Home: 36, End: 35, " ": 32 };
    const parameters = { key: value, modifiers, windowsVirtualKeyCode: codes[value] };
    await contents.debugger.sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown", ...parameters, ...(value === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {})
    });
    await contents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", ...parameters });
}

async function month(contents, year, name) {
    await contents.executeJavaScript(`(() => {
        if (document.querySelector(".datepicker-overlay").hidden) document.getElementById("dateRangePicker").click();
        const heading = document.querySelector(".datepicker-heading");
        if (!document.querySelector(".datepicker-weekdays").hidden) heading.click();
        if (!heading.disabled) heading.click();
        for (let attempt = 0; attempt < 200; attempt++) {
            const cell = document.querySelector('.datepicker-grid button[aria-label="${year}"]');
            if (cell) {
                cell.click();
                document.querySelector('.datepicker-grid button[aria-label="${name} ${year}"]').click();
                return;
            }
            const first = Number(heading.textContent.split(" - ")[0]);
            document.querySelector('.datepicker-header button[aria-label="' + (${year} < first ? "Previous" : "Next") + ' 12 years"]').click();
        }
        throw new Error("Could not navigate to requested year");
    })()`);
}

async function date(contents, value) {
    assert.equal(await contents.executeJavaScript(`(() => {
        const cell = document.querySelector('.datepicker-cell[data-date="${value}"]');
        if (!cell || cell.disabled) return false;
        cell.click();
        return true;
    })()`), true, `Date ${value} must be selectable`);
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
            pickerVisible: !document.querySelector(".datepicker-overlay").hidden,
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

        // Default range, focus trap, and Escape/backdrop dismissal.
        assert.equal(await contents.executeJavaScript(`(() => {
            const today = new Date();
            const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
            const format = date => [String(date.getDate()).padStart(2, "0"), String(date.getMonth() + 1).padStart(2, "0"), date.getFullYear()].join(".");
            return document.getElementById("dateRangePicker").value === format(today) + " - " + format(tomorrow);
        })()`), true);
        await contents.executeJavaScript('document.getElementById("dateRangePicker").focus()');
        await key(contents, "Enter");
        assert.equal(await contents.executeJavaScript('document.activeElement.classList.contains("datepicker-cell")'), true);
        await contents.executeJavaScript('document.querySelector(".datepicker-close").focus()');
        await key(contents, "Tab");
        assert.equal(await contents.executeJavaScript('document.activeElement.getAttribute("aria-label")'), "Previous month");
        await key(contents, "Tab", 8);
        assert.equal(await contents.executeJavaScript('document.activeElement.classList.contains("datepicker-close")'), true);
        await key(contents, "Escape");
        assert.equal(await contents.executeJavaScript('document.activeElement.id'), "dateRangePicker");
        await contents.executeJavaScript('document.getElementById("dateRangePicker").click(); document.querySelector(".datepicker-overlay").click()');
        assert.equal(await contents.executeJavaScript('document.querySelector(".datepicker-overlay").hidden'), true);

        // Minimum date, including disabled cells and month navigation.
        await month(contents, 1920, "November");
        assert.equal(await contents.executeJavaScript('document.querySelector(\'[data-date="05.11.1920"]\').disabled'), true);
        assert.equal(await contents.executeJavaScript('document.querySelector(\'[aria-label="Previous month"]\').disabled'), true);
        await date(contents, "06.11.1920");
        assert.equal(await contents.executeJavaScript('document.getElementById("submit").disabled'), true);
        await date(contents, "06.11.1920");
        assert.equal(await contents.executeJavaScript('document.getElementById("dateRangePicker").value'), "06.11.1920 - 06.11.1920");

        // Leap day and reverse-order selection normalize the range.
        await month(contents, 2024, "March");
        await date(contents, "03.03.2024");
        await month(contents, 2024, "February");
        await date(contents, "29.02.2024");
        assert.equal(await contents.executeJavaScript('document.getElementById("dateRangePicker").value'), "29.02.2024 - 03.03.2024");

        await contents.executeJavaScript('document.getElementById("dateRangePicker").focus()');
        await key(contents, " ");
        assert.equal(await contents.executeJavaScript('document.querySelector(\'[data-date="01.03.2024"]\').classList.contains("in-range")'), true);
        await key(contents, "PageDown");
        assert.equal(await contents.executeJavaScript('document.activeElement.dataset.date'), "01.03.2024");
        await key(contents, "PageUp");
        assert.equal(await contents.executeJavaScript('document.activeElement.dataset.date'), "01.02.2024");
        await key(contents, "Home");
        assert.equal(await contents.executeJavaScript('document.activeElement.dataset.date'), "28.01.2024");
        await key(contents, "End");
        assert.equal(await contents.executeJavaScript('document.activeElement.dataset.date'), "03.02.2024");
        await key(contents, "Escape");

        // Keyboard selection crosses the year boundary and closes automatically.
        await month(contents, 2026, "December");
        await date(contents, "31.12.2026");
        await key(contents, "ArrowRight");
        assert.equal(await contents.executeJavaScript('document.activeElement.dataset.date'), "01.01.2027");
        await key(contents, "Enter");
        assert.equal(await contents.executeJavaScript('document.getElementById("dateRangePicker").value'), "31.12.2026 - 01.01.2027");
        assert.equal(await contents.executeJavaScript('document.querySelector(".datepicker-overlay").hidden'), true);

        await month(contents, 2026, "November");
        await date(contents, "01.11.2026");
        assert.equal(await contents.executeJavaScript(`(() => {
            document.querySelector('[data-date="03.11.2026"]').dispatchEvent(new MouseEvent("mouseenter"));
            return document.querySelector('[data-date="02.11.2026"]').classList.contains("in-range");
        })()`), true);
        await contents.executeJavaScript('document.getElementById("stripParams").requestSubmit()');
        await waitForState(contents, 'getComputedStyle(document.querySelector(".bg-modal")).display === "flex"');
        assert.match(await contents.executeJavaScript('document.getElementById("infotext").textContent'), /both a start and an end/);
        await key(contents, "Escape");
        await contents.executeJavaScript('document.getElementById("dateRangePicker").click()');
        await date(contents, "02.11.2026");

        const original = await fs.readFile(calendarPath, "utf8");
        await fs.writeFile(calendarPath, "invalid calendar");
        await contents.executeJavaScript('document.getElementById("stripParams").requestSubmit()');
        await waitForState(contents, 'getComputedStyle(document.querySelector(".bg-modal")).display === "flex"');
        assert.equal(await contents.executeJavaScript('document.getElementById("modalTitle").textContent'), "Unable to strip calendar");
        await key(contents, "Escape");
        await fs.writeFile(calendarPath, original);

        // Save failures use the styled modal and allow retry without stacked handlers.
        await fs.writeFile(path.join(directory, "stripped"), "blocks directory creation");
        await contents.executeJavaScript('document.getElementById("stripParams").requestSubmit()');
        await waitForState(contents, 'getComputedStyle(document.querySelector(".bg-modal")).display === "flex"');
        assert.equal(await contents.executeJavaScript('document.getElementById("modalTitle").textContent'), "Unable to strip calendar");
        assert.equal(await contents.executeJavaScript('document.getElementById("submit").disabled'), false);
        await contents.executeJavaScript('document.getElementById("yes").click()');
        assert.equal(await contents.executeJavaScript('getComputedStyle(document.querySelector(".bg-modal")).display'), "none");
        await fs.unlink(path.join(directory, "stripped"));
        await contents.executeJavaScript('document.getElementById("stripParams").requestSubmit()');
        await waitForState(contents, 'getComputedStyle(document.querySelector(".bg-modal")).display === "flex"');
        const savedPath = await contents.executeJavaScript('document.getElementById("path").textContent');
        assert.equal(path.dirname(savedPath), path.join(directory, "stripped"));
        assert.match(await fs.readFile(savedPath, "utf8"), /UID:drop-test/);
        assert.equal((await fs.readdir(path.join(directory, "stripped"))).length, 1);
        assert.deepEqual(dialogs, []);
        assert.deepEqual(await contents.executeJavaScript("window.dropErrors"), []);
        assert.equal(await contents.executeJavaScript('document.activeElement.id'), "yes");
        assert.equal(await contents.executeJavaScript('document.getElementById("container").inert'), true);
        await key(contents, "Tab", 8);
        assert.equal(await contents.executeJavaScript('document.activeElement.id'), "no");
        await key(contents, "Tab");
        assert.equal(await contents.executeJavaScript('document.activeElement.id'), "yes");

        // Both dialogs fit the app's minimum window size and buttons are styled.
        window.setMinimumSize(320, 256);
        window.setSize(320, 256);
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(await contents.executeJavaScript(`(() => {
            const panel = document.getElementById("openSaveLocationPopup");
            const bounds = panel.getBoundingClientRect();
            const style = getComputedStyle(document.getElementById("yes"));
            return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0
                && bounds.bottom <= innerHeight && style.backgroundColor === "rgb(252, 185, 0)"
                && style.webkitAppRegion === "no-drag" && panel.scrollHeight > 0;
        })()`), true);
        await contents.executeJavaScript(`
            document.querySelector(".bg-modal").style.display = "none";
            document.getElementById("container").inert = false;
            document.getElementById("dateRangePicker").disabled = false;
            document.getElementById("dateRangePicker").click();
        `);
        assert.equal(await contents.executeJavaScript(`(() => {
            const bounds = document.querySelector(".date-range-picker").getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
        })()`), true);
        await key(contents, "Escape");
        assert.equal(await contents.executeJavaScript('document.activeElement.id'), "dateRangePicker");

        console.log("Electron drag-and-drop passed");
        app.exit(0);
    } catch (error) {
        console.error(error);
        app.exit(1);
    }
})();
