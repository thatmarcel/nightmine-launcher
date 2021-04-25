import { app, ipcMain, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import serve from "electron-serve";
import unzipper from "unzipper";
import tar from "tar-fs";
import gunzip from "gunzip-maybe";
import updater from "electron-simple-updater";
import { launch } from "@xmcl/core";
import { install, getVersionList } from "@xmcl/installer";
import { createWindow } from "./helpers";
const electronDl = require("electron-dl");

const isProd = process.env.NODE_ENV === "production";

if (isProd) {
    serve({ directory: "app" });
} else {
    app.setPath("userData", `${app.getPath("userData")} (development)`);
}

updater.init("https://static.cdn.nightmine.thatmarcel.com/launcher/updates.json");

// Disable dock downloads folder bouncing after downloads
try {
    if (app.dock) {
        app.dock.downloadFinished = () => {};
    }
} catch {}

electronDl();

(async () => {
    await app.whenReady();

    const mainWindow = createWindow("main", {
        width: 1000,
        height: 600,
    });

    if (isProd) {
        await mainWindow.loadURL("app://./home.html");
    } else {
        const port = process.argv[2];
        await mainWindow.loadURL(`http://localhost:${port}/home`);
    }
})();

app.on("window-all-closed", () => {
    app.quit();
});

const getDataPath = () => path.join(app.getPath("appData"), "nightmine", "client");

ipcMain.handle("get-platform", (event) => {
    let archId = "unsupported";

    if (process.platform === "darwin") {
        archId = process.arch === "x64" ? "mac-intel" : "mac-arm";
    } else if (process.platform.startsWith("win")) {
        archId = process.arch === "x64" ? "windows-64" : "windows-32";
    } else if (process.platform === "linux") {
        archId = process.arch === "x64" ? "linux-64" : (process.arch === "x32" ? "linux-32" : "linux-arm");
    }

    return {
        platform: process.platform,
        arch: process.arch,
        archId: archId
    };
});

ipcMain.handle("check-if-file-exists", async (event, filePath) => {
    try {
        await fs.promises.access(path.join(getDataPath(), filePath.split("/").join(path.sep)));
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle("download-file", async (event, url, filePath) => {
    const pathComponents = filePath.split("\\").join("/").split("/");
    const fileName = pathComponents.pop();
    const directoryPath = path.join(getDataPath(), pathComponents.join(path.sep));

    try {
        fs.promises.mkdir(directoryPath, {
            recursive: true
        });
    } catch {}

    try {
        await fs.promises.unlink(path.join(getDataPath(), filePath.split("/").join(path.sep)));
    } catch {
        try {
            fs.rmSync(path.join(getDataPath(), filePath.split("/").join(path.sep)), { recursive: true, force: true });
        } catch {}
    }

 	await electronDl.download(BrowserWindow.getFocusedWindow(), url, {
        directory: directoryPath,
        filename: fileName,
        showBadge: false,
        onProgress: ({ percent }) => event.sender.send("download-file-progress", percent)
    });
});

ipcMain.handle("check-if-game-installed", async (event, version) => {
    const minecraftDirectory = app.getPath("appData") + (process.platform === "darwin" ? "/minecraft" : "/.minecraft");

    try {
        await fs.promises.access(`${minecraftDirectory}/versions/${version}/${version}.jar`);
        await fs.promises.access(`${minecraftDirectory}/versions/${version}/${version}.json`);
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle("install-game", async (event, requestedVersion) => {
    const minecraftDirectory = app.getPath("appData") + (process.platform === "darwin" ? "/minecraft" : "/.minecraft");

    const versions = (await getVersionList()).versions;

    for (const version of versions) {
        if (version.id === requestedVersion) {
            await install(version, minecraftDirectory);
            return;
        }
    }

    throw "Unsupported version";
});

ipcMain.handle("launch-game", async (event, accessToken, username, uuid) => {
    const javaExecutablePath = path.join(getDataPath(), `jre/bin/java${process.platform.startsWith("win") ? ".exe" : ""}`.split("/").join(path.sep));
    await fs.promises.chmod(javaExecutablePath, "755");

    const agentPath = path.join(getDataPath(), ["agents", "189.jar"].join(path.sep));

    const minecraftDirectory = app.getPath("appData") + (process.platform === "darwin" ? "/minecraft" : "/.minecraft");

    console.log("================================");
    console.log("accessToken: " + accessToken);
    console.log("username: " + username);
    console.log("uuid: " + uuid);
    console.log("================================");

    launch({
        gamePath: minecraftDirectory,
        javaPath: javaExecutablePath,
        version: "1.8.9",
        minMemory: "3000",
        maxMemory: "4096",
        extraJVMArgs: [
            `-javaagent:${agentPath}`
        ],
        gameProfile: {
            id: uuid,
            name: username
        },
        accessToken: accessToken,
        extraExecOption: {
            detached: true
        }
    });
});

ipcMain.handle("delete-file", async (event, filePath) => {
    try {
        await fs.promises.unlink(path.join(getDataPath(), filePath.split("/").join(path.sep)));
    } catch {
        fs.rmSync(path.join(getDataPath(), filePath.split("/").join(path.sep)), { recursive: true, force: true });
    }
});

ipcMain.handle("move-file", async (event, from, to) => {
    await fs.promises.rename(path.join(getDataPath(), from.split("/").join(path.sep)), path.join(getDataPath(), to.split("/").join(path.sep)));
});

ipcMain.handle("write-file", async (event, text, filePath) => {
    await fs.promises.writeFile(path.join(getDataPath(), filePath.split("/").join(path.sep)), text);
});

ipcMain.handle("read-file", async (event, filePath) => {
    if (filePath.includes("/")) {
        try {
            fs.promises.mkdir(path.join(getDataPath(), filePath.split("/").slice(0, -1).join(path.sep)), {
                recursive: true
            });
        } catch {}
    }

    try {
        return await fs.promises.readFile(path.join(getDataPath(), filePath.split("/").join(path.sep)), "utf8");
    } catch {
        return "err";
    }
});

ipcMain.handle("extract-file", async (event, filePath, destination) => {
    if (filePath.endsWith(".tar.gz")) {
        await fs.createReadStream(path.join(getDataPath(), filePath.split("/").join(path.sep)))
                .pipe(gunzip())
                .pipe(tar.extract(path.join(getDataPath(), destination.split("/").join(path.sep))))
                .promise();
    } else {
        await fs.createReadStream(path.join(getDataPath(), filePath.split("/").join(path.sep)))
                .pipe(unzipper.Extract({ path: path.join(getDataPath(), destination.split("/").join(path.sep)) }))
                .promise();
    }
});