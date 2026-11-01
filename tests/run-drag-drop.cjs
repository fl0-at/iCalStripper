const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

test("native Electron file drops load date selection without dialogs and retain the source path", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ical-stripper-drop-"));
    try {
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const result = spawnSync(require("electron"), [
            path.join(__dirname, "fixtures", "drag-drop.cjs"),
            directory
        ], {
            cwd: path.resolve(__dirname, ".."),
            env,
            encoding: "utf8",
            timeout: 30000
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout, /Electron drag-and-drop passed/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
});
