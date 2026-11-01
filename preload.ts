import { ipcRenderer, contextBridge, webUtils } from 'electron';

window.addEventListener('DOMContentLoaded', () => {

    const replaceText = (selector:string, text:string) => {
        const element:HTMLElement|null = document.getElementById(selector)
        if (element) element.innerText = text
    }

    const types:Array<any> = ['chrome', 'node', 'electron'];
    const versions:NodeJS.ProcessVersions = process.versions;

    for (const type of types) {
        let curVer = process.env[type];
        if(typeof curVer != 'undefined') replaceText(`${type}-version`, curVer);
    };

});

const api = {
    isFile: (path:string) => ipcRenderer.invoke("is-file", path),
    isICal: (fileType:string, fileName:string) => ipcRenderer.invoke("is-iCal", fileType, fileName),
    getFileContent: (path:string) => ipcRenderer.invoke("get-file-content", path),
    stripICalFile: (path:string, startDate:Date, endDate:Date) => ipcRenderer.invoke("strip-ical-file", path, startDate, endDate),
    saveFileToDisk: (path:string, name:string, data:string, format:string) => ipcRenderer.invoke("save-file-to-disk", path, name, data, format),
    closeApp: () => ipcRenderer.invoke("close-app"),
    getNewFilePath: () => ipcRenderer.invoke("getNewFilePath"),
    openFilePath: (path:string) => ipcRenderer.invoke("open-file-path", path),
    relaunchApp: () => ipcRenderer.invoke("relaunch-app"),
    getPathForFile: (file:File) => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld("api", api);