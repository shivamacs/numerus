const { app, BrowserWindow, Menu, nativeImage, globalShortcut, dialog } = require("electron");
// hot reload for Electron
const reload = require('electron-reload');
const path = require('path');
const ejse = require("ejs-electron");

function createWindow() {
    // logo of the app (custom). Inbuilt Electron feature
    var logo = nativeImage.createFromPath(__dirname + '/icons/logo/numerus.png'); 
    logo.setTemplateImage(true);

    // application window
    const win = new BrowserWindow ({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
            nodeIntegration: true
        },
        icon: logo
    });

    // ejs is used for templating in Electron. Below is the method to send data to an ejs (template) file
    ejse.data({
        pageName: 'Numerus',
        rows: 100,
        columns: 26,
    });
    
    // load template file
    win.loadFile('index.ejs').then(function() {
        win.maximize();
        win.show();
        // win.webContents.openDevTools();
    });

    /* Electron Menu bar customisation */
    //--------------------------------------------------------------------------------------------------
    const isMac = process.platform === 'darwin';
    const template = [
        { // file menu
        label: 'File',
        submenu: [
            { label: 'New', accelerator: 'CommandOrControl+N', role: 'new-file', click() { createWindow(); } },
            // send message to renderer.js
            { label: 'Open...', accelerator: 'CommandOrControl+O', role: 'open-file', click() { win.webContents.send('open-file'); } },
            { label: 'Save', accelerator: 'CommandOrControl+S', role: 'save', click() { win.webContents.send('save-file'); }},
            { type: 'separator' },
            isMac ? {label: 'Close', role: 'close' } : {label: 'Exit', role: 'quit' }
        ]
        },
        { // edit menu
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { type: 'separator' },
            { label: "Select All", role: "select-all-cells", accelerator: "CommandOrControl+A", click() { win.webContents.send('select-all-cells'); }}
        ]
        },
        {
        // help
        role: 'help',
        submenu: [
            {
                label: 'About',
                role: 'about',
                click() { dialog.showMessageBox({ title: "About",
                                                  message: "A spreadsheet application",
                                                  buttons: ['OK']}
                                                ); 
                }
            }
        ]
        }
    ]

    // building menu
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    //--------------------------------------------------------------------------------------------------

    // set custom action for shortcuts using Electron globalShortcut, here Ctrl + A
    globalShortcut.register('CommandOrControl+A', () => {
        win.webContents.send('select-all-cells');
    })
}

// call to electron hot reload
reload(__dirname, {
    electron: path.join(__dirname, 'node_modules/.bin/electron.cmd')
});

app.whenReady().then(createWindow);