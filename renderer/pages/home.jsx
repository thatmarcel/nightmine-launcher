import DefaultContainer from "../components/DefaultContainer";
import { useState } from "react";
import { Pane, Dialog, TextInputField, Paragraph, toaster } from "evergreen-ui";

import { ipcRenderer } from "electron";

const jreURLs = {
    "mac-intel": "https://cdn.azul.com/zulu/bin/zulu15.32.15-ca-jre15.0.3-macosx_x64.zip",
    "mac-arm": "https://cdn.azul.com/zulu/bin/zulu15.32.15-ca-jre15.0.3-macosx_aarch64.zip",
    "windows-64": "https://cdn.azul.com/zulu/bin/zulu15.32.15-ca-jre15.0.3-win_x64.zip",
    "windows-32": "https://cdn.azul.com/zulu/bin/zulu15.32.15-ca-jre15.0.3-win_i686.zip",
    "linux-64": "https://cdn.azul.com/zulu/bin/zulu15.32.15-ca-jre15.0.3-linux_x64.tar.gz",
    "linux-32": "https://cdn.azul.com/zulu/bin/zulu15.32.15-ca-jre15.0.3-linux_i686.tar.gz",
    "linux-arm": "https://cdn.azul.com/zulu-embedded/bin/zulu15.32.15-ca-jre15.0.3-linux_aarch64.tar.gz"
}

const minecraftAuthAPIBaseURL = "https://authserver.mojang.com";

const Home = () => {
    const [didRegisterDownloadProgressListener, setDidRegisterDownloadProgressListener] = useState(false);
    const [shouldShowMinecraftAuthDialog, setShouldShowMinecraftAuthDialog] = useState(false);
    const [isMinecraftAuthRequestRunning, setMinecraftAuthRequestRunning] = useState(false);

    const [minecraftAuthEmail, setMinecraftAuthEmail] = useState("");
    const [minecraftAuthPassword, setMinecraftAuthPassword] = useState("");

    const refreshMinecraftAuth = async (oldClientToken, oldAccessToken) => {
        const response = await fetch(`${minecraftAuthAPIBaseURL}/refresh`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                agent: {
                    name: "Minecraft",
                    version: 1
                },
                accessToken: oldAccessToken,
                clientToken: oldClientToken
            })
        });

        const json = await response.json();

        if (!json["clientToken"]) {
            throw "Error";
        }

        const newClientToken = json["clientToken"];
        const newAccessToken = json["accessToken"];
        const newUsername = json["selectedProfile"]["name"];
        const newUUID = json["selectedProfile"]["id"];

        await ipcRenderer.invoke("write-file", `${newUsername}::${newUUID}::${newClientToken}::${newAccessToken}`, "auth/mc-tokens.txt");

        return {
            clientToken: newClientToken,
            accessToken: newAccessToken,
            username: newUsername,
            uuid: newUUID
        }
    }

    const doMinecraftAuth = async (email, password) => {
        const response = await fetch(`${minecraftAuthAPIBaseURL}/authenticate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                agent: {
                    name: "Minecraft",
                    version: 1
                },
                username: email,
                password: password
            })
        });

        const json = await response.json();

        if (!json["clientToken"]) {
            throw "Error";
        }

        const newClientToken = json["clientToken"];
        const newAccessToken = json["accessToken"];
        const newUsername = json["selectedProfile"]["name"];
        const newUUID = json["selectedProfile"]["id"];

        await ipcRenderer.invoke("write-file", `${newUsername}::${newUUID}::${newClientToken}::${newAccessToken}`, "auth/mc-tokens.txt");

        return {
            clientToken: newClientToken,
            accessToken: newAccessToken,
            username: newUsername,
            uuid: newUUID
        }
    }

    const showMinecraftAuthIfNeeded = async () => {
        document.querySelector("#start-button").innerHTML = "Authenticating...";

        console.log("Checking if saved Minecraft auth credentials exist...");
        const savedCredsString = await ipcRenderer.invoke("read-file", "auth/mc-tokens.txt");
        console.log(`Minecraft auth credentials exist: ${savedCredsString !== "err"}`);

        if (savedCredsString === "err") {
            setShouldShowMinecraftAuthDialog(true);
            return;
        }

        try {
            const { username, uuid, accessToken } = await refreshMinecraftAuth(savedCredsString.split("::")[2], savedCredsString.split("::")[3]);
            start(username, uuid, accessToken);
        } catch {
            setShouldShowMinecraftAuthDialog(true);
        }
    }

    const launchGame = async (username, accessToken, uuid) => {
        console.log("Launching game...");
        await ipcRenderer.invoke("launch-game", accessToken, username, uuid);
        console.log("Game launched");
    }

    const start = async (username, uuid, accessToken) => {
        document.querySelector("#start-button").disabled = true;
        document.querySelector("#start-button").innerHTML = "Downloading...";
    
        if (!didRegisterDownloadProgressListener) {
            ipcRenderer.on("download-file-progress", (event, progress) => {
                console.log(`Download file progress: ${progress}`);
            });
    
            setDidRegisterDownloadProgressListener(true);
        }
    
        const platformInfo = await ipcRenderer.invoke("get-platform");
    
        if (platformInfo.archId === "unsupported") {
            console.log("unsupported");
            return;
        }
    
        const jreExists = await ipcRenderer.invoke("check-if-file-exists", "jre");
    
        console.log(platformInfo);
        console.log(`JRE exists: ${jreExists}`);
        
        const jreURL = jreURLs[platformInfo.archId];
        const jreArchiveFilePath = jreURL.endsWith(".zip") ? "jre.zip" : "jre.tar.gz";
    
        if (!jreExists) {
            console.log("Starting JRE download...");
            await ipcRenderer.invoke("download-file", jreURL, jreArchiveFilePath);
            console.log("JRE downloaded");
    
            console.log("Extracting JRE...");
            await ipcRenderer.invoke("extract-file", jreArchiveFilePath, "jre.temp");
            console.log("JRE extracted");
    
            console.log("Deleting JRE archive...");
            await ipcRenderer.invoke("delete-file", jreArchiveFilePath);
            console.log("JRE archive deleted");
    
            const jreName = jreURL.split("/").pop().split(".").slice(0, platformInfo.platform === "linux" ? -2 : -1).join(".");
    
            if (platformInfo.platform === "darwin") {
                console.log("Moving JRE folder (macOS)...");
                await ipcRenderer.invoke("move-file", `jre.temp/${jreName}/${jreName.split(".")[0].replace("zulu", "zulu-")}.jre/Contents/Home`, "jre");
                console.log("JRE folder moved (macOS)");
            } else {
                console.log("Moving JRE folder...");
                await ipcRenderer.invoke("move-file", `jre.temp/${jreName}`, "jre");
                console.log("JRE folder moved");
            }
    
            console.log("Deleting temporary JRE folder...");
            await ipcRenderer.invoke("delete-file", "jre.temp");
            console.log("Temporary JRE folder deleted");
        }

        console.log("Starting agent download...");
        await ipcRenderer.invoke("download-file", "https://static.cdn.nightmine.thatmarcel.com/agents/189.jar", "agents/189.jar");
        console.log("Agent downloaded");

        console.log("Check if game installed...");
        const gameInstalled = await ipcRenderer.invoke("check-if-game-installed", "1.8.9");
        console.log(`Game installed: ${gameInstalled}`);

        if (!gameInstalled) {
            document.querySelector("#start-button").innerHTML = "Installing...";

            console.log("Installing game...");
            await ipcRenderer.invoke("install-game", "1.8.9");
            console.log(`Game install done`);
        }
    
        document.querySelector("#start-button").innerHTML = "Starting...";

        await launchGame(username, accessToken, uuid);

        document.querySelector("#start-button").innerHTML = "Started";
    
        setTimeout(() => {
            document.querySelector("#start-button").disabled = false;
            document.querySelector("#start-button").innerHTML = "Start playing";
        }, 5000);
    }

    return (
        <DefaultContainer style={{
            backgroundImage: "url(\"/images/bg2.jpg\")",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center"
        }}>
            <h1 className="mt-32 font-extrabold text-8xl text-center text-white" style={{
                textShadow: "4px 4px 16px #000"
            }}>Nightmine</h1>
            <h2 className="mt-1 font-extrabold text-4xl text-center text-white" style={{
                textShadow: "4px 4px 16px #000"
            }}>1.8.9</h2>

            <div className="w-72 mx-auto mt-32">
                <button id="start-button" className="border-4 border-white w-full py-3 text-white rounded-2xl text-3xl font-bold shadow-xl focus:outline-none" style={{
                    textShadow: "2px 2px 8px rgba(0, 0, 0, 0.4)",
                    backgroundColor: "rgba(0, 0, 0, 0.7)"
                }} onClick={showMinecraftAuthIfNeeded}>
                    Start playing
                </button>
            </div>

            <Dialog
                isShown={shouldShowMinecraftAuthDialog}
                title="Minecraft authentication"
                onCloseComplete={() => {
                    if (document.querySelector("#start-button").innerHTML == "Authenticating...") {
                        document.querySelector("#start-button").innerHTML = "Start playing";
                        document.querySelector("#start-button").disabled = false;
                    }

                    setShouldShowMinecraftAuthDialog(false);
                    setMinecraftAuthRequestRunning(false);
                }}
                confirmLabel={isMinecraftAuthRequestRunning ? "Authenticating..." : "Authenticate"}
                isConfirmLoading={isMinecraftAuthRequestRunning}
                onConfirm={async (closeDialog) => {
                    setMinecraftAuthRequestRunning(true);

                    try {
                        const { username, uuid, accessToken } = await doMinecraftAuth(minecraftAuthEmail, minecraftAuthPassword);
                        setMinecraftAuthRequestRunning(false);
                        closeDialog();
                        start(username, uuid, accessToken);
                    } catch (error) {
                        console.log(error);
                        toaster.danger("Login failed, check your credentials and try again");
                        setMinecraftAuthRequestRunning(false);
                        return;
                    }
                }}
                hasCancel={!isMinecraftAuthRequestRunning}
                hasClose={!isMinecraftAuthRequestRunning}
                shouldCloseOnOverlayClick={false}
                shouldCloseOnEscapePress={true /* !isMinecraftAuthRequestRunning */}
            >
                <Pane>
                    <Paragraph>
                        To play, please sign into your Minecraft account.
                        Your login details are only saved locally and sent to Mojang for authentication.
                    </Paragraph>
                    <TextInputField
                        type="email"
                        marginTop={16}
                        marginBottom={12}
                        width="100%"
                        borderRadius={4}
                        name="minecraft-auth-email-input"
                        label="Email"
                        placeholder="paul@example.com"
                        disabled={isMinecraftAuthRequestRunning}
                        value={minecraftAuthEmail}
                        onChange={event => setMinecraftAuthEmail(event.target.value)}
                    />
                    <TextInputField
                        type="password"
                        width="100%"
                        borderRadius={4}
                        name="minecraft-auth-password-input"
                        label="Password"
                        placeholder="123456"
                        disabled={isMinecraftAuthRequestRunning}
                        value={minecraftAuthPassword}
                        onChange={event => setMinecraftAuthPassword(event.target.value)}
                    />
                </Pane>
            </Dialog>
        </DefaultContainer>
    )
}

export default Home;
