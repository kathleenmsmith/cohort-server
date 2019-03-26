// NB the cohort_messages table only stores messages sent with notifications. NOT websocket messages
exports.up = function(knex, Promise) {
  return Promise.all([
    knex.schema.createTable('cohort_messages', (table) => {
      table.increments('id').primary().notNullable()
      table.integer('event_id')
        .references('events.id')
        .onDelete('CASCADE')
      table.json('message')
      table.timestamps()
    })
  ])
};

exports.down = function(knex, Promise) {
  return knex.schema.dropTable('cohort_messages')
};