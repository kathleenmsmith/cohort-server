exports.up = function(knex) {
  return knex.schema.dropTable('events_devices').then( () => {
    return knex.schema.dropTable('devices')
  })
};

exports.down = function(knex) {
  return knex.schema.createTable('devices', (table) => {
    table.increments('id').primary().notNullable()
    table.string('guid').notNullable()
    table.string('apnsDeviceToken')
    table.boolean('isAdmin').notNullable()
    table.timestamps(false, true)
    table.json('tags')
  }).then( () => {
    return knex.schema.createTable('events_devices', table => {
      table.increments('id').primary().notNullable()
      table.unique(['event_id', 'device_id'])
      table.integer('event_id')
        .references('events.id')
        .notNullable()
        .onDelete('CASCADE')
      table.integer('device_id')
        .references('devices.id')
        .notNullable()
        .onDelete('CASCADE')
      table.integer('occasion_id')
        .references('occasions.id')
        .onDelete('CASCADE')
      table.dropUnique(['event_id', 'device_id'])
    })
  })
};