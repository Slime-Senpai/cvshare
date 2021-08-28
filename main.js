(() => {
  // Modules to control application life and create native browser window
  const { app, BrowserWindow } = require('electron');
  const path = require('path');
  const got = require('got');
  const { CookieJar } = require('tough-cookie');
  const FormData = require('form-data');
  const windowStateKeeper = require('electron-window-state');
  const Store = require('./store');

  // #region squirrel
  // this should be placed at top of main.js to handle setup events quickly
  if (handleSquirrelEvent()) {
    // squirrel event handled and app will exit in 1000ms, so don't do anything else
    return;
  }

  function handleSquirrelEvent () {
    if (process.argv.length === 1) {
      return false;
    }

    const ChildProcess = require('child_process');
    const path = require('path');

    const appFolder = path.resolve(process.execPath, '..');
    const rootAtomFolder = path.resolve(appFolder, '..');
    const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
    const exeName = path.basename(process.execPath);

    const spawn = function (command, args) {
      let spawnedProcess;

      try {
        spawnedProcess = ChildProcess.spawn(command, args, { detached: true });
      } catch (error) {}

      return spawnedProcess;
    };

    const spawnUpdate = function (args) {
      return spawn(updateDotExe, args);
    };

    const squirrelEvent = process.argv[1];
    switch (squirrelEvent) {
      case '--squirrel-install':
      case '--squirrel-updated':
        // Optionally do things such as:
        // - Add your .exe to the PATH
        // - Write to the registry for things like file associations and
        //   explorer context menus

        // Install desktop and start menu shortcuts
        spawnUpdate(['--createShortcut', exeName]);

        setTimeout(app.quit, 1000);
        return true;

      case '--squirrel-uninstall':
        // Undo anything you did in the --squirrel-install and
        // --squirrel-updated handlers

        // Remove desktop and start menu shortcuts
        spawnUpdate(['--removeShortcut', exeName]);

        setTimeout(app.quit, 1000);
        return true;

      case '--squirrel-obsolete':
        // This is called on the outgoing version of your app before
        // we update to the new version - it's the opposite of
        // --squirrel-updated

        app.quit();
        return true;
    }
  }

  // #endregion squirrel

  // Window

  function createWindow () {
    // Create the browser window.
    const mainWindowState = windowStateKeeper({
      defaultWidth: 1200,
      defaultHeight: 800
    });

    const mainWindow = new BrowserWindow({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      minWidth: 1000,
      height: mainWindowState.height,
      minHeight: 600,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      },
      autoHideMenuBar: true
    });

    // and load the index.html of the app.
    mainWindow.loadFile('index.html');

    mainWindowState.manage(mainWindow);

    // Open the DevTools.
    // mainWindow.webContents.openDevTools()
  }

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.whenReady().then(() => {
    createWindow();

    const store = new Store({
      fileName: 'user-preferences',
      defaults: {
        props: []
      }
    });

    const { ipcMain } = require('electron');

    const cookieJar = new CookieJar();
    let loggedIn = false;

    // IPC

    // #region login
    ipcMain.on('formData', async (event, arg) => {
      try {
        const loginPage = await got('https://hub.abinteractive.net/login', { cookieJar: cookieJar });
        const loginPageLines = loginPage.body.split('\n');

        let found = false;
        let exited = false;

        const data = [];

        for (const line of loginPageLines) {
          if (!found && line.trim().startsWith('<form class="abi-form" action="https://hub.abinteractive.net/ProcessLogin"')) {
            found = true;
            exited = true;
          } else if (found && exited) {
            if (line.trim().startsWith('</form>')) {
              exited = false;
              break;
            }
            if (line.trim().startsWith('<input')) {
              const startType = line.indexOf('type="') + 6;
              const endType = line.indexOf('"', startType);

              const startName = line.indexOf('name="') + 6;
              const endName = line.indexOf('"', startName);

              if (line.substring(startType, endType) === 'hidden' && line.substring(startName, endName) !== 'redirect_target') {
                const startValue = line.indexOf('value="') + 7;
                const endValue = line.indexOf('"', startValue);
                data[line.substring(startName, endName)] = line.substring(startValue, endValue);
              } else if (line.substring(startType, endType) === 'email') {
                data[line.substring(startName, endName)] = arg.email;
              } else if (line.substring(startType, endType) === 'password') {
                data[line.substring(startName, endName)] = arg.password;
              }
            }
          }
        }

        const processLoginFormData = new FormData();

        for (const [key, value] of Object.entries(data)) {
          processLoginFormData.append(key, value);
        }

        const processLogin = await got.post('https://hub.abinteractive.net/ProcessLogin', {
          body: processLoginFormData,
          cookieJar: cookieJar,
          followRedirect: false
        });

        if (processLogin.statusCode !== 302) {
          throw new Error(processLogin);
        }

        loggedIn = true;

        event.reply('login', 'connected');
      } catch (error) {
        console.error(error);

        loggedIn = false;

        event.reply('login', 'error');
      }
    });

    // #endregion login

    // #region props

    ipcMain.on('propsRefresh', async (event, arg) => {
      if (!loggedIn) {
        event.reply('propsRefreshList', 'notloggedin');
        return;
      }

      const myProps = await got('https://hub.abinteractive.net/myprops', { cookieJar: cookieJar });

      const myPropsLine = myProps.body.split('\n');

      const propsData = [];

      let uuidFound = false;
      let imgFound = true;
      let nameFound = true;
      let nameNextLine = false;
      let propCreated = null;

      for (const line of myPropsLine) {
        if (line.includes('div') && line.includes('abi-prop')) {
          uuidFound = false;
          imgFound = false;
          nameFound = false;
          propCreated = null;
        }
        if (!uuidFound && line.indexOf('edit?id=') !== -1) {
          const start = line.indexOf('edit?id=') + 8;
          const end = line.indexOf('"', start);
          uuidFound = true;
          if (!propCreated) {
            propCreated = { uuid: line.substring(start, end) };
            propsData.push(propCreated);
          } else {
            propCreated.uuid = line.substring(start, end);
          }

          propCreated.isSelected = store.get('props').includes(propCreated.uuid);
        }
        if (!imgFound && line.indexOf('abi-widget__img') !== -1) {
          const start = line.indexOf('src="') + 5;
          const end = line.indexOf('"', start);
          imgFound = true;
          if (!propCreated) {
            propCreated = { imgsrc: line.substring(start, end) };
            propsData.push(propCreated);
          } else {
            propCreated.imgsrc = line.substring(start, end);
          }
        }
        if (!nameFound && line.indexOf('abi-widget__username') !== -1) {
          nameNextLine = true;
          nameFound = true;
        } else if (nameNextLine) {
          nameNextLine = false;
          if (!propCreated) {
            propCreated = { name: line.trim() };
            propsData.push(propCreated);
          } else {
            propCreated.name = line.trim();
          }
        }
      }

      event.reply('propsRefreshList', propsData);
    });

    ipcMain.on('propsSave', async (event, arg) => {
      const propList = [];
      for (const prop of arg.props) {
        propList.push(prop.uuid);
      }

      store.set('props', propList);

      event.reply('propsSaved', '');
    });

    // #endregion props

    // #region friends

    ipcMain.on('friendsRefresh', async (event, arg) => {
      if (!loggedIn) {
        event.reply('propsRefreshList', 'notloggedin');
        return;
      }

      const friends = await got('https://hub.abinteractive.net/social/friends', { cookieJar: cookieJar });

      const friendsLine = friends.body.split('\n');

      const friendsData = [];

      let uuidFound = false;
      let imgFound = true;
      let nameFound = true;
      let nameNextLine = false;
      let friendCreated = null;

      for (const line of friendsLine) {
        if (line.includes('div') && line.includes('abi-friend')) {
          uuidFound = false;
          imgFound = false;
          nameFound = false;
          friendCreated = null;
        }
        if (!uuidFound && line.indexOf('profile?guid=') !== -1) {
          const start = line.indexOf('profile?guid=') + 13;
          const end = line.indexOf('"', start);
          uuidFound = true;
          if (!friendCreated) {
            friendCreated = { uuid: line.substring(start, end) };
            friendsData.push(friendCreated);
          } else {
            friendCreated.uuid = line.substring(start, end);
          }
        }
        if (!imgFound && line.indexOf('abi-widget__img') !== -1) {
          const start = line.indexOf('src="') + 5;
          const end = line.indexOf('"', start);
          imgFound = true;
          if (!friendCreated) {
            friendCreated = { imgsrc: line.substring(start, end) };
            friendsData.push(friendCreated);
          } else {
            friendCreated.imgsrc = line.substring(start, end);
          }
        }
        if (!nameFound && line.indexOf('abi-widget__username') !== -1) {
          nameNextLine = true;
          nameFound = true;
        } else if (nameNextLine) {
          nameNextLine = false;
          if (!friendCreated) {
            friendCreated = { name: line.trim() };
            friendsData.push(friendCreated);
          } else {
            friendCreated.name = line.trim();
          }
        }
      }

      event.reply('friendsRefreshList', friendsData);
    });

    // #endregion friends

    // #region share

    ipcMain.on('shareData', async (event, arg) => {
      // We first prepare the data
      const shareData = { friends: [], objects: [], friendIt: 0, objectIt: 0, nbDone: 0, nbMissed: 0 };
      for (const friend of arg.friends) {
        shareData.friends.push({ uuid: friend.uuid, name: friend.name });
      }

      for (const prop of arg.props) {
        shareData.objects.push({ type: 'Spawnables', uuid: prop.uuid, name: prop.name });
      }

      setTimeout(async function shareProp (retryTimes) {
        const formData = new FormData();

        formData.append('action', 'share');
        formData.append('type', shareData.objects[shareData.objectIt].type);
        formData.append('guid', shareData.objects[shareData.objectIt].uuid);
        formData.append('target', shareData.friends[shareData.friendIt].uuid);

        try {
          if (retryTimes <= 10) {
            await got.post('https://hub.abinteractive.net/contentadmin', { cookieJar: cookieJar, body: formData });
          } else {
            event.reply('shareMissed', { target: shareData.friends[shareData.friendIt], object: shareData.objects[shareData.objectIt] });
            shareData.nbMissed++;
          }

          shareData.objectIt++;

          if (shareData.objectIt >= shareData.objects.length) {
            shareData.friendIt++;
            shareData.objectIt = 0;
          }

          if (shareData.friendIt < shareData.friends.length) {
            shareData.nbDone++;
            event.reply('shareProgress', { target: shareData.friends[shareData.friendIt].name, object: shareData.objects[shareData.objectIt].name, nbDone: shareData.nbDone, nbMissed: shareData.nbMissed, nbTotal: (shareData.objects.length * shareData.friends.length) });
            setTimeout(shareProp, 10, 0);
          } else {
            event.reply('shareDone', { missed: shareData.nbMissed });
          }
        } catch (error) {
          setTimeout(shareProp, 100, retryTimes + 1);
        }
      }, 50, 0);
    });

    ipcMain.on('shareOne', async (event, arg) => {
      // We first prepare the data
      setTimeout(async function shareOne (retryTimes) {
        const formData = new FormData();

        formData.append('action', 'share');
        formData.append('type', arg.object.type);
        formData.append('guid', arg.object.uuid);
        formData.append('target', arg.target.uuid);

        try {
          if (retryTimes <= 10) {
            await got.post('https://hub.abinteractive.net/contentadmin', { cookieJar: cookieJar, body: formData });
          } else {
            event.reply('shareMissed', { target: arg.target, object: arg.object });
          }

          event.reply('shareSuccess', { target: arg.target, object: arg.object });
        } catch (error) {
          setTimeout(shareOne, 100, retryTimes + 1);
        }
      }, 50, 0);
    });

    // #endregion share

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
  });

  // In this file you can include the rest of your app's specific main process
  // code. You can also put them in separate files and require them here.
})();
