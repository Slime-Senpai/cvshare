const electron = require('electron');
const path = require('path');
const fs = require('fs');

class Store {
  constructor (options) {
    this.path = path.join(electron.app.getPath('userData'), options.fileName + '.json');

    try {
      this.data = JSON.parse(fs.readFileSync(this.path));
    } catch (error) {
      this.data = options.defaults;
    }
  }

  get (key) {
    return this.data[key];
  }

  set (key, val, retryTimes = 0) {
    this.data[key] = val;
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data));
    } catch (error) {
      if (retryTimes > 10) {
        console.error('Failed to write too much, stopping');

        return;
      }
      console.error('Can\'t write to file, retry in 5 seconds');
      setTimeout(this.set, 5000, key, val, retryTimes + 1);
    }
  }
}

// expose the class
module.exports = Store;
