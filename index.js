const fs = require('fs');
const xml2js = require('xml2js');
const parseSVG = require('./parser').parse;
const SVGO = require('svgo');
svgo = new SVGO({
  plugins: [
    { cleanupAttrs: true },
    { removeDoctype: true },
    { removeXMLProcInst: true },
    { removeComments: true },
    { removeMetadata: true },
    { removeTitle: true },
    { removeDesc: true },
    { removeUselessDefs: true },
    { removeEditorsNSData: true },
    { removeEmptyAttrs: true },
    { removeHiddenElems: true },
    { removeEmptyText: true },
    { removeEmptyContainers: true },
    { removeViewBox: false },
    { cleanUpEnableBackground: true },
    { convertStyleToAttrs: true },
    { convertColors: true },
    { convertPathData: true },
    { convertTransform: true },
    { removeUnknownsAndDefaults: true },
    { removeNonInheritableGroupAttrs: true },
    { removeUselessStrokeAndFill: true },
    { removeUnusedNS: true },
    { cleanupIDs: true },
    { cleanupNumericValues: true },
    { moveElemsAttrsToGroup: true },
    { moveGroupAttrsToElems: true },
    { collapseGroups: true },
    { removeRasterImages: true },
    { mergePaths: true },
    { convertShapeToPath: true },
    { sortAttrs: true },
    { transformsWithOnePath: false },
    { removeDimensions: true },
    { removeAttrs: { attrs: '(stroke|fill)' } }
  ]
});

// return text of optimized svg text
let getSvgText = function(svgPath) {
  return new Promise((resolve, reject) => {
    fs.readFile(svgPath, 'utf8', function(err, data) {
      if (err) { reject(err) }
      svgo.optimize(data)
        .then(function(result) {
          resolve(result.data);
        })
        .catch((err) => {
          reject(err);
        });
    });
  });
};

// return array of ds
let parseSvgText = function(svgText) {
  return new Promise((resolve, reject) => {
    let parser = new xml2js.Parser();
    parser.parseString(svgText, function(err, result) {
      if (err) { reject(err) }
      let dPaths = [];
      let viewbox = [];
      Object.entries(result.svg).forEach((el) => {
        switch(el[0]) {
          case 'path':
            // array of $.d
            el[1].forEach((path) => {
              dPaths.push(path.$.d);
            });
            break;
          case 'g':
            // array of g.paths
            el[1].forEach((group) => {
              group.path.forEach((path) => {
                dPaths.push(path.$.d);
              });
            });
            break;
          case '$':
            if(el[1].viewBox) {
              viewbox = (el[1].viewBox).split(" ");
            }
            break;
          default:
            console.log("No parse:", el[0]);
        }
      });
      resolve({ dPaths, viewbox });
    });
  });
}

// return array of codes
let pathsToCmds = function(dPaths) {
  cmds = [];
  dPaths.forEach((d) => {
    let command = parseSVG(d);
    makeCmdsAbsolute(command);
    cmds = cmds.concat(command);
  });
  return cmds;
}

// converts all commands to absolute positions
// Every command has x0 and y0 properties - start point.
// Every command has x and y properties - finish point.
let makeCmdsAbsolute = function(commands) {
  var subpathStart, prevCmd= { x: 0, y: 0 };
  var attr = { x: 'x0', y: 'y0', x1: 'x0', y1: 'y0', x2: 'x0', y2: 'y0' };
  commands.forEach((cmd) => {
    if(cmd.command === 'moveto') { subpathStart = cmd; }
    cmd.x0 = prevCmd.x;
    cmd.y0 = prevCmd.y;
    for(var a in attr) {
      if(a in cmd) {
        cmd[a] += cmd.relative ? cmd[attr[a]] : 0;
      }
    }
    if (!('x' in cmd)) { cmd.x = prevCmd.x; } // V
    if (!('y' in cmd)) { cmd.y = prevCmd.y; } // X
    cmd.relative = false;
    cmd.code = cmd.code.toUpperCase();

    if (cmd.command=='closepath') {
      cmd.x = subpathStart.x;
      cmd.y = subpathStart.y;
    }
    prevCmd = cmd;
  });

  return commands;
}

// return array of gcodes
let cmdsToGcode = function(cmds) {
  let currLoc = {x: 0, y: 0};
  let gcode = [];
  cmds.forEach((cmd) => {
    switch(cmd.command) {
      case 'moveto':
        // {x0, y0, x, y}
        gcode.push(`G0 X${cmd.x} Y${cmd.y}`);
        currLoc.x = cmd.x;
        currLoc.y = cmd.y;
        break;
      case 'lineto':
      case 'horizontal lineto':
      case 'vertical lineto':
      case 'closepath':
        // {x0, y0, x, y}
        gcode.push(`G1 X${cmd.x} Y${cmd.y}`);
        currLoc.x = cmd.x;
        currLoc.y = cmd.y;
        break;
      case 'curveto':
        // {x0, y0, x1, y1, x2, y2, x, y}
        // let distance = Math.sqrt(Math.pow(curvePoints[3].x - curvePoints[0].x, 2) + Math.pow(curvePoints[3].y - curvePoints[0].y, 2));
        // do we have to move to the start point? probably not.
        for (let i = 0; i < 10; i++) {
          let t = i / 10;
          let cx = (Math.pow(1 - t, 3) * cmd.x0) + (3 * Math.pow(1 - t, 2) * t * cmd.x1) + (3 * (1 - t) * Math.pow(t, 2) * cmd.x2) + (Math.pow(t, 3) * cmd.x);
          let cy = (Math.pow(1 - t, 3) * cmd.y0) + (3 * Math.pow(1 - t, 2) * t * cmd.y1) + (3 * (1 - t) * Math.pow(t, 2) * cmd.y2) + (Math.pow(t, 3) * cmd.y);
          gcode.push(`G1 X${cx} Y${cy}`);
        }
        break;
      // ignoring these for now
      case 'quadratic curveto':
        // {x0, y0, x, y, x1, y1}
        for (let i = 0; i < 10; i++) {
          let t = i / 10;
          let cx = (Math.pow(1 - t, 2) * cmd.x0) + (2 * (1-t) * t * cmd.x1) + (Math.pow(t, 2) * cmd.x);
          let cy = (Math.pow(1 - t, 2) * cmd.y0) + (2 * (1-t) * t * cmd.y1) + (Math.pow(t, 2) * cmd.y);
          gcode.push(`G1 X${cx} Y${cy}`);
        }
        break;
      case 'smooth curveto':
        // {x0, y0, x, y, x2, y2}
        // S produces the same type of curve as earlier, but if it follows another S
        // command or a C command, the first control point is assumed to be a reflection
        // of the one used previously. If the S command doesn't follow another S or C command,
        // then the current position of the cursor is used as the first control point.
        console.log(cmd)
        break;
      case 'smooth quadratic curveto':
        // {x0, y0, x, y}
        console.log(cmd)
        break;
      case 'elliptical arc':
        // {x0, y0, x, y, rx, ry, xAxisRotation, largeArc:bool, sweep:bool}
        console.log(cmd)
        break;
      default:
        console.log("WHAT IS THIS", cmd.command);
    }
  });
  return gcode;
}

exports = module.exports = svgcode = function(svgPath) {
  return new Promise((resolve, reject) => {
    if(!fs.existsSync(svgPath)) { reject(new Error(`File doesn't exist at path : ${svgPath}`)) }
    if(svgPath.split('.').pop() !== 'svg') { reject(new Error('File doesn\'t end in .svg')) }

    getSvgText(svgPath)
      .then((svgText) => {
        return parseSvgText(svgText);
      })
      .then(({ dPaths, viewbox }) => {
        let cmds = pathsToCmds(dPaths);
        let gcode = cmdsToGcode(cmds);
        // custom commands for application - not valid generally
        gcode.unshift(`G92 X${viewbox[0]} Y${viewbox[1]}`, `G92.2 X${viewbox[2]} Y${viewbox[3]}`, 'G90');
        gcodeString = gcode.join("\n");
        resolve(gcodeString);
      })
      .catch((err) => {
        reject(err);
      });
  });
};
