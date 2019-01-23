const webSocket = require('ws')
const CHDevice = require('./models/CHDevice')
const _flatten = require('lodash/flatten')
const _uniqBy = require('lodash/uniqBy')

module.exports = (options) => {

  return new Promise( resolve => {
    let webSocketServer = new webSocket.Server({server: options.server, path: options.path})
    
    webSocketServer.on('listening', () => {
      console.log('websocket server started')
      resolve(webSocketServer)
    })
    
    webSocketServer.on('connection', function connection(socket) {
      console.log('websocket server: new connection')
  
      socket.on('message', (message) => {
        let msg

        try {
          msg = JSON.parse(message)
        } catch(error) {
          console.log("Error: received invalid JSON in message from client: " + error.message)
          return
        }

        // initial message from device with its GUID
        if((msg.guid != null && msg.guid !== undefined) && 
          (msg.eventId != null && msg.eventId !== undefined)) {
          
          let event = getOpenEventWithId(msg.eventId)
          
          if(event == undefined){
            socket.close(4002, "No open event found with id:" + msg.eventId)
            return
          } 
          
          let matchingDevices =  event.devices
            .filter( device => device.guid == msg.guid)
  
          if(matchingDevices.length == 1){
            let device = matchingDevices[0]
  
            socket.isAlive = true
            socket.on('pong', keepalive)
     
            device.socket = socket
  
            socket.send(JSON.stringify({ result: "success" }))

            event.broadcastDeviceStates() // eventually this should get triggered by a deviceStatesDidChange event bubbled up from CHDevice... I think?

            console.log('opened socket for device: ' + msg.guid)
          } else if (matchingDevices.length == 0 ){
            console.log("Error: could not open WebSocket, device not found")
            socket.close(4000, "Devices must be registered via HTTP before opening a WebSocket connection")
          } else if (matchingDevices.length > 1 ){
            console.log("Error: there are devices with identical GUIDs!")
            socket.close(4001)
          }
        }
      })
  
      socket.on('close', (code, reason) => {
        let matchingDevices = allDevices().filter( device => {
          return device.socket === socket
        })

        if(matchingDevices === undefined) {
          console.log("Warning: received request to close socket but could not find a matching device (close code: " + code + ", reason: " + reason)
          return
        }

        if(matchingDevices.length !== 1){
          console.log("Warning: you may have found an edge case in websocket close handler")
          console.log('closed socket for unknown device')
          socket.isAlive = false
          return
        }

        if(matchingDevices.length == 1){
          let device = matchingDevices[0]
          let message = 'closed socket for device ' + device.guid + ' with code ' + code
          if(reason != null && reason !== undefined && reason != ""){ message += ' | reason: ' + reason }
          console.log(message)
          socket.isAlive = false // it will get .terminate()d and nulled by the keepalive function

          // tell events with this device to broadcast an update
          let eventsWithThisDevice = options.app.get("cohort").events.filter( event => {
            if(event.devices.find( deviceInEvent => deviceInEvent._id = device._id)){
              return event
            } 
          })

          eventsWithThisDevice.forEach( event => event.broadcastDeviceStates() )// eventually this should get triggered by a deviceStatesDidChange event bubbled up from CHDevice... I think?
        }
      })
  
      socket.on('error', (error) => {
        console.log('socket error for device ' + device.guid + ': ' + error)
      })
    })

    const keepaliveInterval = setInterval(function ping(){
  
      const connectedDevices = allDevices().filter( device => device.socket != null && device.socket !== undefined)
  
      // console.log("sending keepalive to " + connectedSockets.length + " clients");
  
      connectedDevices.forEach( (device) => {
        let socket = device.socket
        if(socket.isAlive === false){
          socket.terminate()
          socket = null
        } else {
          socket.isAlive = false
          socket.ping(noop)
        }
      })
    }, 10000)
  
    function noop() {}
    
    function keepalive() {
      // console.log('received pong')
      this.isAlive = true
    }

    /*
     *   Controller-ish utility functions...
     */

    function getOpenEventWithId(eventId){
      let matchingEvents = options.app.get('cohort').events
      .filter( event => event._id == eventId) // only open events are in memory

      if(matchingEvents.length != 1 || matchingEvents == undefined){
        console.log('Error: could not find open event with id:' + eventId)
        return undefined
      } else {
        return matchingEvents[0]
      }
    }

    // returns a flat array of all devices checked into active events
    function allDevices(){
      let nestedDevices = options.app.get("cohort").events
      .map( event => event.devices)
      let flatDevices = _flatten(nestedDevices)
      let uniqueDevices = _uniqBy(flatDevices, '_id')
      return uniqueDevices
    }
  })
}