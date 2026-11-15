'use strict';
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('BCHESS_DESKTOP', {
  platform: process.platform,
  version: require('electron').app.getVersion()
});
