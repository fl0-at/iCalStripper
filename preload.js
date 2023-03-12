const { ipcRenderer, contextBridge } = require("electron");

window.addEventListener('DOMContentLoaded', () => {

    const replaceText = (selector, text) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }

    for (const type of ['chrome', 'node', 'electron']) {
        replaceText(`${type}-version`, process.versions[type])
    }
});

const api = {
    isFile: (path) => ipcRenderer.invoke("is-file", path),
    isICal: (fileType) => ipcRenderer.invoke("is-iCal", fileType),
    convertICalToJSON: (path) => ipcRenderer.invoke("convert-ics-to-json", path),
    stripJCal: (jCal, startDate, endDate) => ipcRenderer.invoke("strip-jcal", jCal, startDate, endDate),
    convertJSONToICal: (jCal_stripped) => ipcRenderer.invoke("convert-json-to-ics", jCal_stripped),
    saveFileToDisk: (path, name, data, format) => ipcRenderer.invoke("save-file-to-disk", path, name, data, format),
    closeApp: () => ipcRenderer.invoke("close-app"),
    getNewFilePath: () => ipcRenderer.invoke("getNewFilePath"),
    openFilePath: (path) => ipcRenderer.invoke("open-file-path", path),
    relaunchApp: () => ipcRenderer.invoke("relaunch-app"),
}

contextBridge.exposeInMainWorld("api", api);

