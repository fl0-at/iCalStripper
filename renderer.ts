function requiredElement<T extends HTMLElement>(selector: string, type: { new(): T }): T {
    const element = document.querySelector(selector);
    if (!(element instanceof type)) throw new Error(`Missing UI element: ${selector}`);
    return element;
}

const dropzone = requiredElement("#dropzone", HTMLDivElement);
const stripForm = requiredElement("#stripParams", HTMLFormElement);
const submit = requiredElement("#submit", HTMLInputElement);
const sectionBeforeDrop = requiredElement("#beforeDrop", HTMLElement);
const sectionAfterDrop = requiredElement("#afterDrop", HTMLElement);
const datepickerElement = requiredElement("#dateRangePicker", HTMLInputElement);
const modalBG = requiredElement(".bg-modal", HTMLDivElement);
const modal = requiredElement("#openSaveLocationPopup", HTMLDivElement);
const buttonYes = requiredElement("#yes", HTMLButtonElement);
const buttonBoth = requiredElement("#both", HTMLButtonElement);
const buttonNo = requiredElement("#no", HTMLButtonElement);
const infoTxt = requiredElement("#infotext", HTMLDivElement);
const pathTxt = requiredElement("#path", HTMLDivElement);
const modalTitle = requiredElement("#modalTitle", HTMLHeadingElement);
const pageHeader = requiredElement(".header", HTMLDivElement);
const pageContent = requiredElement("#container", HTMLDivElement);
const pageFooter = requiredElement("footer", HTMLElement);
const picker = new DateRangePicker(datepickerElement, complete => {
    submit.disabled = !complete;
});
submit.disabled = true;

let loadingFile = false;
let processing = false;
let source: { path: string; name: string } | null = null;
let modalMode: "error" | "saved" = "error";
let savedPath = "";
let previousFocus: HTMLElement | null = null;

function showModal(mode: "error" | "saved", message: string, detail: string): void {
    picker.close();
    modalMode = mode;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalTitle.textContent = mode === "saved" ? "Your calendar is ready" : "Unable to strip calendar";
    infoTxt.textContent = message;
    pathTxt.textContent = detail;
    pathTxt.classList.toggle("saved-path", mode === "saved");
    buttonYes.textContent = mode === "saved" ? "Open file location & restart" : "Amend dates / try again";
    buttonBoth.textContent = mode === "saved" ? "Open file location & quit" : "Restart";
    buttonNo.textContent = mode === "saved" ? "Quit now" : "Quit";
    modalBG.style.display = "flex";
    pageHeader.inert = pageContent.inert = pageFooter.inert = true;
    buttonYes.focus();
}

function closeModal(): void {
    modalBG.style.display = "none";
    pageHeader.inert = pageContent.inert = pageFooter.inert = false;
    previousFocus?.focus();
}

modal.addEventListener("keydown", event => {
    if (event.key === "Escape" && modalMode === "error") {
        event.preventDefault();
        closeModal();
    } else if (event.key === "Tab") {
        if (event.shiftKey && document.activeElement === buttonYes) {
            event.preventDefault();
            buttonNo.focus();
        } else if (!event.shiftKey && document.activeElement === buttonNo) {
            event.preventDefault();
            buttonYes.focus();
        }
    }
});

async function modalAction(action: "retry" | "restart" | "quit"): Promise<void> {
    if (action === "retry" && modalMode === "error") {
        closeModal();
        return;
    }
    try {
        if (modalMode === "saved" && action !== "quit") await window.api.openFilePath(savedPath);
        if (action === "quit" || (action === "restart" && modalMode === "saved")) await window.api.closeApp();
        else await window.api.relaunchApp();
    } catch (error) {
        console.error("Unable to complete the dialog action:", error);
        infoTxt.textContent = `Unable to complete this action: ${error instanceof Error ? error.message : String(error)}`;
    }
}

buttonYes.addEventListener("click", () => void modalAction("retry"));
buttonBoth.addEventListener("click", () => void modalAction("restart"));
buttonNo.addEventListener("click", () => void modalAction("quit"));

// Prevent Chromium from navigating to files dropped outside the drop zone.
document.addEventListener("dragover", event => event.preventDefault());
document.addEventListener("drop", event => event.preventDefault());

dropzone.addEventListener("drop", async event => {
    event.stopPropagation();
    event.preventDefault();
    if (loadingFile || source) return;
    if (!event.dataTransfer) {
        dropzone.textContent = "Unable to read the dropped file. Please try again.";
        return;
    }
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
        dropzone.textContent = "Please drop exactly one iCal (.ics or .ical) file at a time.";
        return;
    }
    loadingFile = true;
    try {
        const file = files[0];
        const filePath = window.api.getPathForFile(file);
        if (!filePath) throw new Error("The dropped file has no local file path.");
        const isFile = await window.api.isFile(filePath);
        const isICal = await window.api.isICal(file.type, file.name);
        if (!isFile || !isICal) {
            dropzone.textContent = "Please drop a valid iCal (.ics or .ical) file.";
            return;
        }
        source = { path: filePath, name: file.name };
        dropzone.style.display = sectionBeforeDrop.style.display = "none";
        stripForm.style.display = sectionAfterDrop.style.display = "flex";
        submit.disabled = picker.getRange() === null;
        datepickerElement.disabled = false;
    } catch (error) {
        console.error("Unable to load the dropped iCalendar file:", error);
        const message = error instanceof Error ? error.message : String(error);
        dropzone.textContent = `Unable to load this iCalendar file: ${message} Please try again.`;
    } finally {
        loadingFile = false;
    }
});

stripForm.addEventListener("submit", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (processing || !source) return;
    const range = picker.getRange();
    if (!range) {
        showModal("error", "Please select both a start and an end date.", "Choose the date range you want to keep.");
        return;
    }
    range.end.setHours(23, 59, 59, 999);
    processing = true;
    submit.disabled = datepickerElement.disabled = true;
    picker.close();
    try {
        const calendar = await window.api.stripICalFile(source.path, range.start, range.end);
        savedPath = await window.api.saveFileToDisk(source.path, source.name, calendar, "ics");
        showModal("saved", "Your file has been saved under the following location:", savedPath);
    } catch (error) {
        console.error("Unable to process or save the iCalendar file:", error);
        submit.disabled = picker.getRange() === null;
        datepickerElement.disabled = false;
        showModal("error", error instanceof Error ? error.message : String(error), "Amend the date range or try again.");
    } finally {
        processing = false;
    }
});
