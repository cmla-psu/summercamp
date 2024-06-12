const fs = require('fs');
const pnglib = require('pnglib');
require('@tensorflow/tfjs')
const TeachableMachine = require('@sashido/teachablemachine-node');

module.exports = {
    inputDataState: false,
    imagesize_x:  224,
    imagesize_y:  224,
    colormap:  new Map([  //r g b alpha
        ['unknown', [0x00, 0x00, 0x00, 0]], //unknown is clear
        ['air', [0x00, 0x00, 0x00, 0]], //air is clear
        ['white', [0xff, 0xff, 0xff, 255]], 
        ['orange', [0xff, 0xa5, 0x00, 255]], 
        ['magenta', [0xff, 0x00, 0xff, 255]],
        ['lightBlue', [0xad, 0xd8, 0xe6, 255]], 
        ['yellow', [0xff, 0xff, 0x00, 255]], 
        ['lime', [0x32, 0xcd, 0x32, 255]], 
        ['pink', [0xff, 0xc0, 0xcb, 255]], 
        ['gray', [0x80, 0x80, 0x80, 255]], 
        ['lightGray', [0xd3, 0xd3, 0xd3, 255]],
        ['cyan', [0x00, 0xff, 0xff, 255]], 
        ['purple', [0xa0, 0x20, 0xf0, 255]], 
        ['blue', [0x00, 0x00, 0xff, 255]], 
        ['brown', [0x96, 0x4b, 0x00, 255]], 
        ['green', [0x00, 0xff, 0x00, 255]], 
        ['red', [0xff, 0x00, 0x00, 255]], 
        ['black', [0x00, 0x00, 0x00, 255]], 
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
             palette.set(item[0], myimage.color(item[1][0], item[1][1], item[1][2], item[1][3]))
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
    classify(bitmapString, onsuccess, onerror) {
        // on success gets the array of predictions as a callback
        // on error gets an error message
        let datauri = this.bitmapToDataURI(bitmapString)
        if(datauri === undefined) {
            onerror("Image data is not valid.")
        } else if (this.TheDrawing.tmModel === null) {
          onerror("Model name is not specified.");
        } else {
          this.savePNG(datauri, `image_${this.TheDrawing.drawNumber}.png`)
          this.TheDrawing.tmModel.classify({
              imageUrl: datauri,
          }).then((predictions) => {
              onsuccess(predictions)
          }).catch((e) => {
              var error = "Can't classify, something went wrong.";
              if(e.includes("Loading model")) {
                error = `The model name might be wrong.`
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

    TheDrawing:  {
       modelName: null,
       tmModel: null,
       drawNumber: 0,
       clearai: false,
       height: 0,
       width: 0,
       data: [],
       clear() {
           this.height = 0;
           this.width = 0;
           this.data = [];
       },
       setModel(m) {
           if(this.clearai) {
               this.modelName = null;
           }
           if(m === this.modelName) {
               // do nothing
           } else {
              this.modelName = m;
              let modeluri = `https://teachablemachine.withgoogle.com/models/${this.modelName.trim()}/`
              this.tmModel = new TeachableMachine({modelUrl: modeluri})
           }
           this.clearai = false;
       },
       setSize(h,w) {
           this.height = h;
           this.width = w;
       },
       addRow(r) {
           let toPieces = r.split(/\W+/);
           this.data[this.data.length] = toPieces;
       },
       makeString() {
           let cleandata = [];
           for(i=0; i<this.height; i++) {
               cleandata[i] = [];
               if(typeof(this.data[i]) === 'object') {
                   for(j=0; j<this.width; j++) {
                        if(typeof(this.data[i][j]) === 'string') {
                             cleandata[i][j] = this.data[i][j]
                        } else {
                             cleandata[i][j] = "air"
                        }
                   }
               } else {
                   for(j=0; j<this.width; j++) {
                       cleandata[i][j] = "air";
                   }
               }

           }
           return cleandata.map(x => x.join(" ")).join(",")
       }
    }
}

