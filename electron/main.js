/**
 * Kamkhadze PA — Electron Main Process
 *
 * Starts the Express backend internally, then opens a desktop window.
 * The app runs entirely on localhost — no outside network access needed.
 */
const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path   = require('path');
const fs     = require('fs');

const isDev = !app.isPackaged;
const resourcesDir = isDev
  ? path.join(__dirname, '..')
  : path.join(process.resourcesPath);

const dotenvPath = path.join(resourcesDir, 'backend', '.env');
if (fs.existsSync(dotenvPath)) {
  require('dotenv').config({ path: dotenvPath });
} else {
  console.warn('[Electron] No .env found at', dotenvPath,
    '— using defaults. Run db/init.js to set up the database.');
}

let serverPort = parseInt(process.env.PORT || '3000');

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = isDev
      ? path.join(__dirname, '..', 'backend', 'server.js')
      : path.join(resourcesDir, 'backend', 'server.js');

    try {
      if (!isDev) {
        process.env.STATIC_ROOT = resourcesDir;
      }
      require(serverPath);
      console.log('[Electron] Backend started on port', serverPort);
      resolve();
    } catch (err) {
      console.error('[Electron] Failed to start backend:', err);
      reject(err);
    }
  });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    title: 'Kamkhadze PA — Case Manager',
    backgroundColor: '#05080f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    frame: true,
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('mailto:') || !url.startsWith(`http://localhost:${serverPort}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    {
      label: 'Kamkhadze PA',
      submenu: [
        { label: 'About', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools', visible: isDev },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  buildMenu();
  try {
    await startServer();
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      'Startup Error',
      `The Kamkhadze PA server could not start.\n\n${err.message}\n\n` +
      'Make sure you have run "node db/init.js" to set up the database.'
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
