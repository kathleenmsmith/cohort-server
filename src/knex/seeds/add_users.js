require('dotenv').config({ path: __dirname + '/../../../.env' })

exports.seed = function(knex) {
  if(process.env.NODE_ENV == "production"){
    // DO NOT DO ANYTHING TO THE PRODUCTION DATABASE :)
    return;
  } else {
    // Deletes ALL existing entries
    return knex.raw('TRUNCATE TABLE users RESTART IDENTITY CASCADE')
    .then(function () {
      return knex('users').insert([{
        username: 'dev_user', // admin
        password: process.env.DEV_USER_PASSWORD_HASH,
        is_admin: true
      },{
        username: 'test_admin_user', // admin
        password: process.env.TEST_ADMIN_USER_PASSWORD_HASH,
        is_admin: true
      },{
        username: 'test_user_1',
        password: process.env.TEST_USER_1_PASSWORD_HASH,
        is_admin: false
      },{
        username: 'test_user_2',
        password: process.env.TEST_USER_2_PASSWORD_HASH,
        is_admin: false
      }])
    });
  }
}; 
