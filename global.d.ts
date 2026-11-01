interface Window {
    api: {
        isFile(path: string): Promise<boolean>;
        isICal(fileType: string, fileName: string): Promise<boolean>;
        getPathForFile(file: File): string;
        getFileContent(path: string): Promise<string>;
        stripICalFile(path: string, start: Date, end: Date): Promise<string>;
        saveFileToDisk(path: string, name: string, data: string, format: string): Promise<string>;
        getNewFilePath(): Promise<string>;
        openFilePath(path: string): Promise<void>;
        relaunchApp(): Promise<void>;
        closeApp(): Promise<void>;
    };
}