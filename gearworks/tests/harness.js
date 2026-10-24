// Loads the Gearworks modules into Node so they can be tested without a browser.
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.window = globalThis;
globalThis.THREE = (() => { try { return require(path.join(__dirname, '..', '..', 'vendor', 'three.r128.min.js')); } catch(e){ try { return require(path.join(__dirname, '..', 'vendor', 'three.min.js')); } catch(e2){ return require('three/build/three.min.js'); } } })();
const root = path.join(__dirname, '..', 'js');
module.exports = function load(files){
  files.forEach(f => vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }));
  globalThis.GW.Anim = null;           // tests want gears at full size immediately, not popping in
  return globalThis.GW;
};
