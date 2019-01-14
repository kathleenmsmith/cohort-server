const knex = require('../knex.js')
const CHDevice = require('../../models/CHDevice')

Events = () => {
  return knex('events')
}

// queries

getAll = () => {
  return Events().select()
}

getOneByID = (eventId) => {
  return Events().where('id', parseInt(eventId))
    .then( events => {
      if(events.length == 1){
        event = events[0]
        return getDevicesForEvent(event.id).then( devices => {
          event.devices = devices
          return event
        })
      } else {
        throw new Error()
      }
    })
}

addOne = (event) => {
  return Events()
    .insert(event)
    .returning('id')
}

deleteOne = (eventId) => {
  return Events().where('id', parseInt(eventId)).del()
}

checkIn = (eventId, deviceId) => {
  // defined inline in eventsController.js
}

getDevicesForEvent = (eventId) => {
  return Events()
    .where('events.id', parseInt(eventId))
    .join('events_devices', 'events.id', 'events_devices.event_id')
    .join('devices', 'device_id', 'devices.id')
    .select(
      'event_id',
      'label', 
      'guid as device_guid', 
      'apnsDeviceToken as device_apnsDeviceToken', 
      'isAdmin as device_isAdmin', 
    )
    .reduce((devices, result) => {
      let device = new CHDevice(result.device_guid)
      device.apnsDeviceToken = result.device_apnsDeviceToken
      device.isAdmin = result.device_isAdmin
      devices.push(device)
      return devices
    }, [])
}

open = (eventId) => {
  return Events()
    .where('events.id', parseInt(eventId))
    .update({'isOpen': true})
    .returning('id')
    .then( id => {
      return Events().where('events.id', parseInt(id)).then( events => events[0])
    })
}

close = (eventId) => {
  return Events()
    .where('events.id', parseInt(eventId))
    .update({'isOpen': false})
    .returning('id')
    .then( id => {
      return checkOutAllDevices(id).then( returnCode => {
        return Events().where('events.id', parseInt(id)).then( events => events[0])
      })
    })
}

checkOutAllDevices = (eventId) => {
  return knex('events_devices')
  .where('event_id', parseInt(eventId))
  .del()
}

module.exports = { 
  getAll: getAll,
  getOneByID: getOneByID,
  addOne: addOne,
  deleteOne: deleteOne,
  getDevicesForEvent: getDevicesForEvent,
  open: open,
  close: close
}