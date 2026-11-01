// delcare html elements
const dropzone:HTMLDivElement|null = document.getElementsByTagName("div").namedItem("dropzone");
const stripForm:HTMLFormElement|null = document.getElementsByTagName("form").namedItem("stripParams");
const submit:HTMLInputElement|null = document.getElementsByTagName("input").namedItem("submit");
const sectionBeforeDrop:HTMLElement|null = document.getElementsByTagName("section").namedItem("beforeDrop");
const sectionAfterDrop:HTMLElement|null = document.getElementsByTagName("section").namedItem("afterDrop");
const datepickerElement:HTMLInputElement|null = document.getElementsByTagName("input").namedItem("dateRangePicker");
const modalBG:HTMLElement|null = document.querySelector(".bg-modal");
const divModalBG:HTMLElement|null = document.querySelector("div.bg-modal");
const buttonYes:HTMLButtonElement|null = document.querySelector("input.button#yes");
const buttonBoth:HTMLButtonElement|null = document.querySelector("input.button#both");
const buttonNo:HTMLButtonElement|null = document.querySelector("input.button#no");
const infoTxt:HTMLElement|null = document.getElementById("infotext");
const pathTxt:HTMLElement|null = document.getElementById("path");
document.getElementById("openSaveLocation")?.addEventListener("submit", (e) => e.preventDefault());

// check if any HTML element does not exist
if (!(
    dropzone &&
    stripForm &&
    submit &&
    sectionBeforeDrop && sectionAfterDrop &&
    datepickerElement &&
    modalBG && divModalBG &&
    buttonBoth && buttonNo && buttonYes &&
    infoTxt && pathTxt
)) {
    throw new Error("Unexpected Error - one or more HTML elements is null");                            
}


// Prevent Chromium from navigating to files dropped outside the drop zone.
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());

let loadingFile = false;

dropzone.addEventListener("drop", async (e) => {
    // stop propagation and prevent default behaviour
    e.stopPropagation();
    e.preventDefault();

    // get files
    if (loadingFile || dropzone.style.display === "none") return;
    if (!e.dataTransfer) {
        dropzone.textContent = "Unable to read the dropped file. Please try again.";
        return;
    }
    
    const files = e.dataTransfer.files;
    
    if (files.length === 1) {

        // get today's and tomorrow's datetime
        const todayDateTime = new Date(); 
        const tomorrowDateTime = new Date();
        tomorrowDateTime.setDate((todayDateTime.getDate() + 1));


        // date picker?!?
        const dpe = "#dateRangePicker";
        const dpo:any = {
            range: true,
            multipleDatesSeparator: ' - ',
            minDate: new Date('1920-11-06'),
            selectedDates: [todayDateTime, tomorrowDateTime],
            isMobile: true,
            autoClose: true,
            locale: {
                days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                daysMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
                months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
                monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                today: 'Today',
                clear: 'Clear',
                dateFormat: 'dd.MM.yyyy',
                timeFormat: 'HH:mm',
                firstDay: 0
            }
        };
        // for each file that was dropped, do this:
        for (const file of files) {
            let filePath: string;
            let isFile: boolean;
            let isICal: boolean;
            loadingFile = true;
            try {
                filePath = window.api.getPathForFile(file);
                if (!filePath) throw new Error("The dropped file has no local file path.");
                isFile = await window.api.isFile(filePath);
                isICal = await window.api.isICal(file.type, file.name);
                if (isFile && isICal) window.api.newAirDatePicker(dpe, dpo);
            } catch (error) {
                console.error("Unable to load the dropped iCalendar file:", error);
                const message = error instanceof Error ? error.message : String(error);
                dropzone.textContent = `Unable to load this iCalendar file: ${message} Please try again.`;
                return;
            } finally {
                loadingFile = false;
            }

            if (isFile && isICal) {
                // hide dropzone only after the dropped file has been validated
                dropzone.style.setProperty("display", "none");
                sectionBeforeDrop.style.setProperty("display", "none");

                // show strip form
                stripForm.style.setProperty("display", "flex");
                sectionAfterDrop.style.setProperty("display", "flex");

                // enable the submit button
                submit.disabled = false;
                datepickerElement.disabled = false;

                // if the submit button is clicked:
                stripForm.addEventListener("submit", async (e) => {

                    // stop propagation and prevent default behaviour
                    e.stopPropagation();
                    e.preventDefault();

                    // disable submit button
                    submit.disabled = true;
                    if(datepickerElement===null||typeof datepickerElement === 'undefined') throw new Error("Datepicker element must not be null or undefined!");
                    datepickerElement.disabled = true;

                    // get start and end date for range from datepicker
                    const dateRange:string = datepickerElement.value;
                    
                    // parse input string to numbers
                    const startYear:number = Number(String((dateRange).split(" - ")[0]).split(".")[2]);
                    const startMonth:number = Number(String(String(dateRange).split(" - ")[0]).split(".")[1])-1;
                    const startDay:number = Number(String(String(dateRange).split(" - ")[0]).split(".")[0]);
                    
                    const endYear:number = Number(String(String(dateRange).split(" - ")[1]).split(".")[2]);
                    const endMonth:number = Number(String(String(dateRange).split(" - ")[1]).split(".")[1])-1;
                    const endDay:number = Number(String(String(dateRange).split(" - ")[1]).split(".")[0]);

                    // assign dates to startDate and endDate params
                    const startDate = new Date( startYear, startMonth, startDay );
                    const endDate = new Date( endYear, endMonth, endDay );
                    endDate.setHours(23, 59, 59, 999);

                    // check if startDate > endDate
                    if (!(startDate <= endDate)) { // show user a warning                       

                        // show modal bg
                        modalBG.style.display = "flex";
                        divModalBG.style.setProperty("background-color", "rgba(0,0,0,0.75)");

                        // change button text                        
                        buttonYes.setAttribute("value", "Close dialogue");
                        buttonBoth.setAttribute("value", "Restart");
                        buttonNo.setAttribute("value", "Quit");

                        // enable buttons
                        buttonYes.disabled = false;
                        buttonBoth.disabled = false;
                        buttonNo.disabled = false;

                        // change info texts                        
                        infoTxt.innerHTML = "Start date cannot be later than end date!";
                        pathTxt.innerHTML = "Please amend dates, relaunch or quit.";

                        // if one of the buttons is clicked, the appropriate action will be taken
                        buttonYes.addEventListener("click", async (e) => {
                            // hide the modal dialogue and then let the user try again
                            modalBG.style.display = "none";

                            // reset button text
                            buttonYes.setAttribute("value", "Open file location & restart");
                            buttonBoth.setAttribute("value", "Open file location & quit");
                            buttonNo.setAttribute("value", "Quit now");

                            // disable buttons
                            buttonYes.disabled = true;
                            buttonBoth.disabled = true;
                            buttonNo.disabled = true;

                            // reset info text
                            infoTxt.innerHTML = "Your file has been saved under the following location:";
                            pathTxt.innerHTML = "$path";

                            // finally re-enable the submit button
                            submit.disabled = false;
                            if(datepickerElement===null||typeof datepickerElement === 'undefined') throw new Error("Datepicker element must not be null or undefined!");
                            datepickerElement.disabled = false;

                            // that's it, the user is free to try again now :D
                        });
                        buttonBoth.addEventListener("click", async (e) => {
                            // relaunch app
                            window.api.relaunchApp();
                        });
                        buttonNo.addEventListener("click", async (e) => {
                            // close app
                            window.api.closeApp();
                        });

                    } else { // continue                        
                        const curFile = file;
                        let newICal: string;
                        try {
                            newICal = await window.api.stripICalFile(filePath, startDate, endDate);
                        } catch (error) {
                            submit.disabled = false;
                            datepickerElement.disabled = false;
                            const message = error instanceof Error ? error.message : String(error);
                            window.alert(`Unable to process this iCalendar file: ${message}`);
                            return;
                        }

                        // save the new iCal to the disk
                        await window.api.saveFileToDisk(filePath, curFile.name, newICal, "ics");

                        // show modal bg
                        modalBG.style.display = "flex";
                        divModalBG.style.setProperty("background-color", "rgba(0,0,0,0.75)");

                        // enable buttons
                        buttonYes.disabled = false;
                        buttonNo.disabled = false;
                        buttonBoth.disabled = false;

                        // inform user about save location
                        let path = await window.api.getNewFilePath();
                        pathTxt.textContent = path;

                        // if one of the three buttons is clicked, take appropriate action
                        buttonYes.addEventListener("click", async (e) => {
                            e.stopPropagation();
                            e.preventDefault();

                            // open file location
                            window.api.openFilePath(path);

                            // relaunch app
                            window.api.relaunchApp();
                        });
                        buttonBoth.addEventListener("click", async (e) => {
                            e.stopPropagation();
                            e.preventDefault();

                            // open file location and quit
                            window.api.openFilePath(path);

                            // close app
                            window.api.closeApp();
                        });
                        buttonNo.addEventListener("click", async (e) => {
                            // close app
                            window.api.closeApp();
                        });
                    }                    
                });
            } else {
                dropzone.textContent = "Please drop a valid iCal (.ics or .ical) file.";
            }
        }
    } else {
        dropzone.textContent = "Please drop exactly one iCal (.ics or .ical) file at a time.";
    }
});
