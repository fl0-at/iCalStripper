const dropzone = document.getElementById("dropzone");
const stripForm = document.getElementById("stripParams");
const submit = document.getElementById("submit");
const startDateElement = document.getElementById("startDate");
const endDateElement = document.getElementById("endDate");
const sectionBeforeDrop = document.getElementById("beforeDrop");
const sectionAfterDrop = document.getElementById("afterDrop");

function updateStartDatePicker(obj) {
    endDateElement.setAttribute("min", obj.value);
    if (endDateElement.getAttribute("value") < obj.value) {
        endDateElement.setAttribute("value", obj.value);
    }
    startDateElement.setAttribute("value", obj.value);
}

function updateEndDatePicker(obj) {
    startDateElement.setAttribute("max", obj.value);
    if (startDateElement.getAttribute("value") > obj.value) {
        startDateElement.setAttribute("value", obj.value);
    }
    endDateElement.setAttribute("value", obj.value);
}

startDateElement.addEventListener("keydown", function (e) {
    e.preventDefault();
});

endDateElement.addEventListener("keydown", function (e) {
    e.preventDefault();
});

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

        // get today's date time and strip away the time so we get today's date only
        const todayDateTime = new Date();
        const [todayDate] = todayDateTime.toISOString().split("T");

        // populate date pickers
        startDateElement.setAttribute("value", todayDate);
        endDateElement.setAttribute("value", todayDate);

        // enable the submit button
        submit.disabled = false;

        // for each file that was dropped, do this:
        for (const file of files) {

            // populate booleans with their appropriate values
            const isFile = await window.api.isFile(file.path);
            const isICal = await window.api.isICal(file.type);

            //console.log(file, isFile, isICal);

            if (isFile && isICal) {
                // if the submit button is clicked:
                submit.addEventListener("click", async (e) => {                                     

                    // stop propagation and prevent default behaviour
                    e.stopPropagation();
                    e.preventDefault();

                    // disable submit button
                    submit.disabled = true;

                    // get start and end date for range from datepickers
                    const startDate = new Date(startDateElement.getAttribute("value"));
                    const endDate = new Date(endDateElement.getAttribute("value"));

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

                        // strip the JSON file of unnecessary event objects
                        const jCal_stripped = await window.api.stripJCal(jCal, startDate, endDate);

                        // build a new iCal file from stripped JSON
                        const newICal = await window.api.convertJSONToICal(jCal_stripped);

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



