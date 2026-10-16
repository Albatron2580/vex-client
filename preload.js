const { contextBridge, ipcRenderer } = require('electron');

// The page can only call handlers registered in main.js, and gets errors back as normal exceptions.
contextBridge.exposeInMainWorld('vex', {
  call: async (channel, ...args) => {
    if (!/^[a-z]+:[a-zA-Z]+$/.test(channel)) throw new Error('Invalid request.');
    const res = await ipcRenderer.invoke(channel, ...args);
    if (!res || !res.ok) throw new Error((res && res.error) || 'Something went wrong.');
    return res.data;
  },
  onEvent: (cb) => {
    const fn = (_e, data) => cb(data);
    ipcRenderer.on('vex:event', fn);
    return () => ipcRenderer.removeListener('vex:event', fn);
  },
});
