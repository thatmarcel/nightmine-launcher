# Nightmine Launcher
**Electron-based launcher for the Nightmine Minecraft client**

## Installation
### Linux
#### Debian, Ubuntu, Pop!_OS, ...
For installing the launcher on Debian-based distributions, using the APT repository is recommended.
Adding the repository can be done with the following command:

```shell
sudo su -c "echo \"deb [trusted=yes] https://repo.nightmine.download/apt/ /\" > /etc/apt/sources.list.d/nightmine.list"
```

After adding the repository, install the launcher via:

```shell
sudo apt-get update
sudo apt-get -y install nightmine-launcher
```

#### Other distributions
Alternatively, you can also install the launcher by downloading the AppImage from the [Releases](https://github.com/thatmarcel/nightmine-launcher/releases) and opening it with [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher)

## Windows
Download the Setup executable from the [Releases](https://github.com/thatmarcel/nightmine-launcher/releases)