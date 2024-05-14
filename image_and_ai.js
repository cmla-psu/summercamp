const fs = require('fs');
const pnglib = require('pnglib');
require('@tensorflow/tfjs-node')
const TeachableMachine = require('@sashido/teachablemachine-node');

module.exports = {
    imagesize_x:  224,
    imagesize_y:  224,
    colormap:  new Map([
        ['0', [0xe8, 0x14, 0x16]], //red
        ['1', [0xff, 0xa5, 0x00]], //orange
        ['2', [0xfa, 0xeb, 0x36]], //yellow
        ['3', [0x79, 0xc3, 0x14]], //green
        ['4', [0x48, 0x7d, 0xe7]], //blue
        ['5', [0x4b, 0x36, 0x9d]], //indigo
        ['6', [0x70, 0x36, 0x9d]], //violet
        ['7', [0x00, 0x00, 0x00]], //black
        ['8', [0xff, 0xff, 0xff]], //white
        ['9', [0xbd, 0x9e, 0x84]], //brown
        ['a', [0xb7, 0xd1, 0xd5]], //gray
    ]),
    bitmapToDataURI(thestring) {
      //lines are separated by commas, colors within a line are separated by spaces
      // image is given row by row starting from the top
      let datauri = undefined
      try {
         let depth = this.colormap.size
         let lines = thestring.split(",").map(x => x.trim().split(/\W+/));
         let height = lines.length
         let width = lines.map(x => x.length).reduce((x,y) => x<y?x:y) //min length (they should really all be same length)
         let myimage = new pnglib(this.imagesize_x, this.imagesize_y, depth)
         let palette = new Map()
         for(item of this.colormap) {
             palette.set(item[0], myimage.color(item[1][0], item[1][1], item[1][2], 255))
         }
         for(y=0; y<this.imagesize_y; y++) {
             for(x=0; x<this.imagesize_x; x++) {
                 float_x = x/(this.imagesize_x - 1) * (width - 1);
                 float_y = y/(this.imagesize_y - 1) * (height -1);
                 small_x = Math.round(float_x)
                 small_y = Math.round(float_y)
                 colorname = lines[small_y][small_x]
                 myimage.buffer[myimage.index(x, y)] = palette.get(colorname) 
             }
         }
         datauri = "data:image/png;base64," + myimage.getBase64()
      } catch(error) {
          console.log(error)
      }
      return datauri
    },
    classify(modelname, bitmapString, onsuccess, onerror) {
        // on success gets the array of predictions as a callback
        // on error gets an error message
        let modeluri = `https://teachablemachine.withgoogle.com/models/${modelname.trim()}/`
        let datauri = this.bitmapToDataURI(bitmapString)
        if(datauri === undefined) {
            onerror("Image datat is not valid.")
        } else {
          let model = new TeachableMachine({modelUrl: modeluri})
          model.classify({
              imageUrl: datauri,
          }).then((predictions) => {
              onsuccess(predictions)
          }).catch((e) => {
              var error = "Can't classify, something went wrong.";
              if(e.includes("Loading model")) {
                error = `The model ${modelname} name might be wrong.`
              } 
              onerror(error)
        })};
    },
    argmax(predictions) {
        if(predictions.length === 0) {
           return undefined
        } else {
           var bestclass = undefined
           var bestscore = -1
           for(candidate of predictions) {
               nextclass = candidate.class
               nextscore = candidate.score
               if(nextscore >= bestscore) {
                   bestclass = nextclass
                   bestscore = nextscore
               }
           }
           return [bestclass, bestscore]
           
        }
    },
    savePNG(datauri, filename) {
         const scheme = "data:image/png;base64,";
         if(datauri.startsWith(scheme)) {
             let contents = datauri.slice(scheme.length)
             fs.writeFile(filename, contents, 'base64', (err) => {console.log(err);});
         } else {
             console.log("This is not a data uri for a PNG")
         }
    },
}

