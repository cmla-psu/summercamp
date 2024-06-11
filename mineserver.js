#!/usr/bin/env node
"use strict"

/* Installatins that need to be done:
    npm install ws
    npm install uuid 
    npm install pnglib  //for png handling
    npm i @tensorflow/tfjs-node, or npm i @tensorflow/tfjs-node-gpu if you have CUDA
    npm install @sashido/teachablemachine-node (can be done without the tfjs-node install but is slower)
*/
const os = require('os')
const WebSocket = require('ws') // websocket server
const uuid = require('uuid')   // minecraft api needs uuids
const readline = require('node:readline')
const EventEmitter = require('node:events');
const ImageAI = require('./image_and_ai.js');


const statusPeriod = 10_000
const ip = os.networkInterfaces()["wlp170s0"][0]["address"]
const promptString = `cmd:> `
if (process.argv.length !== 3) {
  console.error('Port is not specified on command line');
  process.exit(1);
}
const port = Number(process.argv[2])
let verbose = true

function cleanup() {
    console.log("\nExiting ...")
    theJobs.close()
    if(global.wsserver !== undefined) {
        wsserver.close()
    }
    clearTimeout()
    process.exit(0);
}


function housekeeping() {
    //TODO: housekeeping
    setTimeout(housekeeping, statusPeriod)
}

function queueStatus() {
   cmdMessage(`${theJobs.sendQSize()} items in send queue.\n${theJobs.awaitQSize()} commands need acknowledgement.`) 
}

function cmdMessage(msg) {
    console.log("\n" + msg)
    process.stdout.write(promptString + commandline.line)
}

/*************************************
 * Code for managing jobs
 ************************************/

const theJobs = {
    socket: null,
    jobLimit: 200,
    sendQueue: [],
    awaitQueue: new Map(),
    mineEventEmitter: new EventEmitter(),
    TryToSend: "trytosend",

    setSocket(socket) {
        if(this.socket === null) { 
           this.socket = socket;
           this.mineEventEmitter.on(this.TryToSend, () => this.doSend())
        } else { 
           console.log("Socket already set.")
        }
    },
    sendQSize() { return this.sendQueue.length},
    awaitQSize() {return this.awaitQueue.size},
    close() {
        this.mineEventEmitter.removeAllListeners()
    },
    enqueue(minecmd, callback=null) {
       this.sendQueue.push([minecmd, callback])
       this.mineEventEmitter.emit(this.TryToSend)
    },
    doSend() {
        if(this.jobLimit - this.awaitQueue.size > 0) {
            let nextThing = this.sendQueue.shift()
            if(nextThing !== undefined) {
                let nextCommand = nextThing[0];
                let nextCallback = nextThing[1];
                let cmdid=nextCommand.header.requestId
                this.socket.send(JSON.stringify(nextCommand))
                if(verbose) {cmdMessage(`${JSON.stringify(nextCommand)}`)}
                this.awaitQueue.set(cmdid, [nextCommand, nextCallback])
            }
        }
    },
    acknowledged(message) {
        let cmdid = message.header.requestId
        let failed = (message.body.statusCode < 0)
        if(this.awaitQueue.has(cmdid)) {
           let thecmd = this.awaitQueue.get(cmdid)
           if(failed) {
             cmdMessage(`Command failed:\n ${JSON.stringify(thecmd[0])}\n${message.body.statusMessage}`)
           } else if(thecmd[1] !== null) {
              let todo = thecmd[1].next()
              if(!todo.done) {
                  this.enqueue(todo.value, thecmd[1])
              } 
           }
           this.awaitQueue.delete(cmdid)
           this.mineEventEmitter.emit(this.TryToSend)
        } else {
           cmdMessage(`Command id ${cmdid} does not exist.`)
        }
    },
    
}


/***************************************
 * Set up websocket server 
 ****************************************/

console.log(`WSS Running at ${ip}:${port}`)
const wsserver = new WebSocket.Server({ port: port })

// On Minecraft, when you type "/connect localhost:3000" it creates a connection
wsserver.on('connection', socket => {
  cmdMessage('Connected ...');
  theJobs.setSocket(socket);
  socket.send(JSON.stringify({
    header: {
      version: 1,                  
      requestId: uuid.v4(),         
      messageType: "commandRequest", 
      messagePurpose: "subscribe"   
    },
    body: {
      eventName: "PlayerMessage"      
    },
  }))
  socket.on('message', stuff => {
      let info = JSON.parse(stuff);
      if(verbose) {cmdMessage(`${JSON.stringify(info)}`)}
      let purpose = info.header.messagePurpose
      if(purpose === "event") {
          if(info.header.eventName === 'PlayerMessage') {
              handlePlayerMessage(info);
          }
      } else if(purpose === "commandResponse") {
          theJobs.acknowledged(info)
      }
  })
})


function handlePlayerMessage(info) {
    let sender = info.body.sender;
    let fullMessage = info.body.message;
    let possibleHeader = `[${sender}]`;
    let message = fullMessage;
    if(fullMessage.startsWith(possibleHeader)) {
        message = fullMessage.slice(possibleHeader.length).trim()
    } 
    if(sender !== "teacher") {
        if(message.startsWith("AIEND")) {
            ImageAI.inputDataState = false;
            let theimagedata = ImageAI.TheDrawing.makeString();
            classify(theimagedata, sender);
        } else if(message.startsWith("AISTART")) {
            ImageAI.inputDataState = true;
            ImageAI.TheDrawing.clear();
            ImageAI.TheDrawing.drawNumber += 1;
            let pieces = message.split(/\W+/);
            let themodel = pieces[1].trim()// .slice(0, -1); //the colon gets removed by the split
            let height = parseInt(pieces[2]);
            let width = parseInt(pieces[3]);
            ImageAI.TheDrawing.setModel(themodel);
            ImageAI.TheDrawing.setSize(height, width);
        } else if(ImageAI.inputDataState) {
            ImageAI.TheDrawing.addRow(message);
        }
        //if(message.startsWith("classify")) {
        //    classify(message, sender)
        //}
        //mineCommand = JSON.stringify("/say chat command from wsserver");
        //theJobs.enqueue(mineCommand)
    }

}

function createMineChatCommand(strcommand) {
    return {
              body: {
                 version: 1,
                 commandLine: `${strcommand}`,
                 origin: {
                     type: "player"
                 }
              },
              header: {
                 requestId: uuid.v4(),
                 messagePurpose: "commandRequest",
                 version: 1,
                 messageType: "commandRequest"
              }

            }

}

/******************************************
 * set up command line readers 
 *****************************************/

const commandline = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptString,
});

commandline.on('line', (line) => {
    let cmddata = line.trim()
    if(cmddata === "exit" || cmddata === "quit") {
        commandline.close()
    } else if(cmddata === "verbose") {
        verbose = !verbose;
        cmdMessage(`verbose set to ${verbose}`)
    } else if(cmddata === "status") {
        queueStatus()
    } else if(cmddata.startsWith("/")) {
        theJobs.enqueue(createMineChatCommand(cmddata))
        commandline.prompt() // because send command does not produce output
    }else {
         commandline.prompt()
    }
}).on("close", () => {
    cleanup()
})

commandline.prompt()


/****************************************
 * set up periodic housekeeping status
 ***************************************/
setTimeout(housekeeping, statusPeriod)


/***************************************
 * Set up custom interactions
 **************************************/

function classify(bitmapstring, username) {
   ImageAI.classify(bitmapstring, (predictions) => {
       let best = ImageAI.argmax(predictions)
       let cmddata = `/tell ${username} Classified as ${best[0]} with score ${best[1]}.`
       theJobs.enqueue(createMineChatCommand(cmddata))
   }, (errormessage) => {
       theJobs.enqueue(createMineChatCommand(`/tell ${username} ${errormessage}`))
   })
}
