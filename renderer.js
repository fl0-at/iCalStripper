const dropzone = document.getElementById("dropzone");
const stripForm = document.getElementById("stripParams");
const submit = document.getElementById("submit");
const sectionBeforeDrop = document.getElementById("beforeDrop");
const sectionAfterDrop = document.getElementById("afterDrop");
const datepickerElement = document.getElementById("dateRangePicker");


dropzone.addEventListener("dragover", (e) => {
    // stop propagation and prevent default behaviour
    e.stopPropagation();
    e.preventDefault();
});

dropzone.addEventListener("drop", async (e) => {
    // stop propagation and prevent default behaviour
    e.stopPropagation();
    e.preventDefault();

    // get files
    const files = e.dataTransfer.files;

    if (files.length === 1) {

        // hide dropzone
        dropzone.style.setProperty("display", "none");
        sectionBeforeDrop.style.setProperty("display", "none");

        // show strip form
        stripForm.style.setProperty("display", "flex");
        sectionAfterDrop.style.setProperty("display", "flex");

        // get today's and tomorrow's datetime
        const todayDateTime = new Date(); 
        const tomorrowDateTime = new Date();
        tomorrowDateTime.setDate((todayDateTime.getDate() + 1));


        // date picker?!?
        const dpe = "#dateRangePicker";
        const dpo = {
            range: true,
            multipleDatesSeparator: ' - ',
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
        const datepicker = window.api.newAirDatePicker(dpe,dpo);

        // enable the submit button
        submit.disabled = false;
        datepickerElement.disabled = false;

        // for each file that was dropped, do this:
        for (const file of files) {

            // populate booleans with their appropriate values
            const isFile = await window.api.isFile(file.path);
            const isICal = await window.api.isICal(file.type);

            const fileContent = await window.api.getFileContent(file.path);
            console.log(String(fileContent));

            console.log(file, isFile, isICal);

            if (isFile && isICal) {
                // if the submit button is clicked:
                submit.addEventListener("click", async (e) => {                                     

                    // stop propagation and prevent default behaviour
                    e.stopPropagation();
                    e.preventDefault();

                    // disable submit button
                    submit.disabled = true;
                    datepickerElement.disabled = true;

                    // get start and end date for range from datepicker
                    const dateRange = datepickerElement.value;       
                    const startDate = new Date( String(String(dateRange).split(" - ")[0]).split(".")[2], String(String(dateRange).split(" - ")[0]).split(".")[1]-1, String(String(dateRange).split(" - ")[0]).split(".")[0] );
                    const endDate = new Date( String(String(dateRange).split(" - ")[1]).split(".")[2], String(String(dateRange).split(" - ")[1]).split(".")[1]-1, String(String(dateRange).split(" - ")[1]).split(".")[0] );                    

                    // check if startDate > endDate
                    if (!(startDate <= endDate)) { // show user a warning

                        // show modal bg
                        document.querySelector(".bg-modal").style.display = "flex";
                        document.querySelector("div.bg-modal").style.setProperty("background-color", "rgba(0,0,0,0.75)");

                        // change button text
                        document.querySelector("input.button#yes").setAttribute("value", "Close dialogue");
                        document.querySelector("input.button#both").setAttribute("value", "Restart");
                        document.querySelector("input.button#no").setAttribute("value", "Quit");

                        // enable buttons
                        document.querySelector("input.button#yes").disabled = false;
                        document.querySelector("input.button#both").disabled = false;
                        document.querySelector("input.button#no").disabled = false;

                        // change info texts
                        document.getElementById("infotext").innerHTML = "Start date cannot be later than end date!";
                        document.getElementById("path").innerHTML = "Please amend dates, relaunch or quit.";

                        // if one of the buttons is clicked, the appropriate action will be taken
                        document.getElementById("yes").addEventListener("click", async (e) => {
                            // hide the modal dialogue and then let the user try again
                            document.querySelector(".bg-modal").style.display = "none";

                            // reset button text
                            document.querySelector("input.button#yes").setAttribute("value", "Open file location & restart");
                            document.querySelector("input.button#both").setAttribute("value", "Open file location & quit");
                            document.querySelector("input.button#no").setAttribute("value", "Quit now");

                            // disable buttons
                            document.querySelector("input.button#yes").disabled = true;
                            document.querySelector("input.button#both").disabled = true;
                            document.querySelector("input.button#no").disabled = true;

                            // reset info text
                            document.getElementById("infotext").innerHTML = "Your file has been saved under the following location:";
                            document.getElementById("path").innerHTML = "$path";

                            // finally re-enable the submit button
                            submit.disabled = false;
                            datepickerElement.disabled = false;

                            // that's it, the user is free to try again now :D
                        });
                        document.getElementById("both").addEventListener("click", async (e) => {
                            // relaunch app
                            window.api.relaunchApp();
                        });
                        document.getElementById("no").addEventListener("click", async (e) => {
                            // close app
                            window.api.closeApp();
                        });

                    } else { // continue
                        // convert the iCal file to JSON
                        var curFile = file;
                        const jCal = await window.api.convertICalToJSON(curFile.path);
                        console.log(jCal);
                        // strip the JSON file of unnecessary event objects
                        const jCal_stripped = await window.api.stripJCal(jCal, startDate, endDate);
                        console.log(jCal_stripped);
                        // build a new iCal file from stripped JSON
                        const newICal = await window.api.convertJSONToICal(jCal_stripped);
                        console.log(newICal);
                        // save the new iCal to the disk
                        window.api.saveFileToDisk(curFile.path, curFile.name, newICal, "ics");

                        // show modal bg
                        document.querySelector(".bg-modal").style.display = "flex";
                        document.querySelector("div.bg-modal").style.setProperty("background-color", "rgba(0,0,0,0.75)");

                        // enable buttons
                        document.querySelector("input.button#yes").disabled = false;
                        document.querySelector("input.button#no").disabled = false;
                        document.querySelector("input.button#both").disabled = false;

                        // inform user about save location
                        var path = await window.api.getNewFilePath();
                        document.getElementById("path").innerHTML = path;

                        // if one of the three buttons is clicked, take appropriate action
                        document.getElementById("yes").addEventListener("click", async (e) => {
                            e.stopPropagation();
                            e.preventDefault();

                            // open file location
                            window.api.openFilePath(path);

                            // relaunch app
                            window.api.relaunchApp();
                        });
                        document.getElementById("both").addEventListener("click", async (e) => {
                            e.stopPropagation();
                            e.preventDefault();

                            // open file location and quit
                            window.api.openFilePath(path);

                            // close app
                            window.api.closeApp();
                        });
                        document.getElementById("no").addEventListener("click", async (e) => {
                            // close app
                            window.api.closeApp();
                        });
                    }                    
                });
            }
        }
    } else {// let the user know that they should only drop one file at a time

        // show modal bg
        document.querySelector(".bg-modal").style.display = "flex";
        document.querySelector("div.bg-modal").style.setProperty("background-color", "rgba(0,0,0,0.75)");

        // hide unnecessary buttons and change the text for the others
        document.querySelector("input.button#both").style.display = "none";
        document.querySelector("input.button#yes").setAttribute("value", "Restart");
        document.querySelector("input.button#no").setAttribute("value", "Quit");
        
        // enable buttons
        document.querySelector("input.button#yes").disabled = false;        
        document.querySelector("input.button#no").disabled = false;

        // change info texts        
        document.getElementById("infotext").innerHTML = "You have dropped " + files.length + " files, but this tool can only handle 1 file at a time.";
        document.getElementById("path").innerHTML = "Please restart the app or quit.";

        // if one of the two buttons is clicked, the appropriate action will be taken
        document.getElementById("yes").addEventListener("click", async (e) => {
            // relaunch app
            window.api.relaunchApp();
        });
        document.getElementById("no").addEventListener("click", async (e) => {
            // close app
            window.api.closeApp();
        });

    }
});



