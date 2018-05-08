## svgcode
Converts SVG files to gcode. Originally build to draw SVGs with custom robot.
Uses https://pegjs.org to create parser.js

G1s are normal paths to draw
G0s are move paths (not drawing)
generated gcode doesn't include Z values.

## USAGE
npm install

```javascript
const fs = require('fs');
const svgcode = require('./svgcode'); // include this folder
svgcode(pathToSVG)
  .then((gcode) => {
    // gcode is string of gcode file
    // save gcode file
    let gcodeFilename = ((pathToSVG).split('/').pop()).replace(".svg", `-${Date.now()}.gcode`);
    fs.writeFileSync(gcodeFilename, gcode);
  })
  .catch((err) => {
    console.log(err);
  });
```

## TODO
* add Zs instead of using G0 as non drawing moves
* currently not parsing:
  * smooth curveto
  * smooth quadratic curveto
  * elliptical arc
