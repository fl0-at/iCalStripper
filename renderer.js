const dropzone = document.getElementById("dropzone");
const stripForm = document.getElementById("stripParams");
const submit = document.getElementById("submit");
const startDateElement = document.getElementById("startDate");
const endDateElement = document.getElementById("endDate");
const sectionBeforeDrop = document.getElementById("beforeDrop");
const sectionAfterDrop = document.getElementById("afterDrop");

function updateStartDatePicker(obj) {
    startDateElement.setAttribute("value", obj.value);
}

function updateEndDatePicker(obj) {
    endDateElement.setAttribute("value", obj.value);
}

dropzone.addEventListener("dragover", (e) => {
    e.stopPropagation();
    e.preventDefault();
});

dropzone.addEventListener("drop", async (e) => {
    e.stopPropagation();
    e.preventDefault();

    const files = e.dataTransfer.files;

    dropzone.style.setProperty("display", "none");//   setAttribute("visibility", "hidden");    
    sectionBeforeDrop.style.setProperty("display", "none");
    stripForm.style.setProperty("display", "flex");//    setAttribute("visiblity", "visible");
    sectionAfterDrop.style.setProperty("display", "flex");

    const todayDateTime = new Date();
    const [todayDate] = todayDateTime.toISOString().split("T");

    startDateElement.setAttribute("value", todayDate );
    endDateElement.setAttribute("value", todayDate );

    submit.disabled = false;

    for (const file of files) {        

        const isFile = await window.api.isFile(file.path);
        const isICal = await window.api.isICal(file.type);

        //console.log(file, isFile, isICal);

        if (isFile && isICal) {
            submit.addEventListener("click", async (e) => {
                e.stopPropagation();
                e.preventDefault();

                submit.disabled = true;                

                const startDate = new Date(startDateElement.getAttribute("value"));
                const endDate = new Date(endDateElement.getAttribute("value"));

                // convert the iCal file to JSON
                var curFile = file;
                const jCal = await window.api.convertICalToJSON(curFile.path);
                //console.log(jCal);
                //window.api.saveFileToDisk(curFile.path, '', JSON.stringify(jCal), "JSON");

                // strip the JSON file of unnecessary event objects
                const jCal_stripped = await window.api.stripJCal(jCal, startDate, endDate);
                //window.api.saveFileToDisk(curFile.path, '', JSON.stringify(jCal_stripped), "JSON");
                //console.log(jCal_stripped);

                // build a new iCal file from stripped JSON
                const newICal = await window.api.convertJSONToICal(jCal_stripped);
                //console.log(newICal);
   

                // save the new iCal to the disk
                window.api.saveFileToDisk(curFile.path, curFile.name, newICal, "ics");

                // inform user about save location
                document.querySelector(".bg-modal").style.display = "flex";                              
                document.querySelector("input.button#yes").disabled = false;
                document.querySelector("input.button#no").disabled = false;
                document.querySelector("input.button#both").disabled = false;
                document.querySelector("div.bg-modal").style.setProperty("background-color", "rgba(0,0,0,0.75)");
                var path = await window.api.getNewFilePath();
                document.getElementById("path").innerHTML = path;

                document.getElementById("yes").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    // open file location and quit
                    window.api.openFilePath(path);

                    // reset app
                    window.api.relaunchApp();
                });
                document.getElementById("both").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    // open file location and quit
                    window.api.openFilePath(path);

                    // reset app
                    window.api.closeApp();
                });
                document.getElementById("no").addEventListener("click", async (e) => {
                    // don't open file location and quit
                    
                    window.api.closeApp();
                });


            });


               
        }

    }
});



