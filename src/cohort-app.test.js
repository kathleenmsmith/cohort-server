// Copyright Jacob Niedzwiecki, 2019
// Released under the MIT License (see /LICENSE)

const request = require('supertest')
const uuid = require('uuid/v4')
const knex = require('./knex/knex')
const moment = require('moment')

const CHSession = require('./models/CHSession')
const login = require('./cohort-test-helpers').login

var app
process.env.NODE_ENV = 'test'

beforeEach( async () => {
  console.log('global beforeEach()')
  await knex.migrate.rollback()
  await knex.migrate.latest()
  await knex.seed.run()

  app = require('./cohort-app')
  await CHSession.initAndSetOnApp(app)
})

afterEach( async () => {
  console.log('global afterEach()')
  await knex.migrate.rollback()
  // per issue #12, we should actually tear down the app/server here
  app.set('cohort', null)
})

afterAll( async () => {
  console.log("global afterAll")
  await knex.destroy()
})

/* 
 *    UTILITY METHODS
 */

beforeAll( () => {
  
})



/*
 *    BASIC TESTS
 */

describe('Basic startup', () => {

  test('the app inits', async () => {
    const res = await request(app).get('/api/v2')
    expect(res.status).toEqual(200)
    expect(res.text).toEqual('Cohort rocks')
  })

  test('the app inits a second time', async () => {
    const res = await request(app).get('/api/v2')
    expect(res.status).toEqual(200)
    expect(res.text).toEqual('Cohort rocks')
  })
})

/*    USER ROUTES */
describe('User registration', () => {

  test('register -- happy path', async () => {
    const res = await request(app)
      .post('/api/v2/users')
      .send({
        'username': 'cohort_test_user',
        'password': '4444'
      })
    
    expect(res.status).toEqual(201)
    expect(res.body.id).toBeDefined()
    expect(res.header.location).toEqual('/api/v2/users/' + res.body.id)
    expect(res.body.username).toEqual('cohort_test_user')
    expect(res.body.password).toBeUndefined()
  })

  test('register -- happy path, twice', async () => {
    const res = await request(app)
      .post('/api/v2/users')
      .send({
        'username': 'cohort_test_user',
        'password': '4444'
      })
    
    expect(res.status).toEqual(201)
    expect(res.body.id).toBeDefined()
    expect(res.header.location).toEqual('/api/v2/users/' + res.body.id)
    expect(res.body.username).toEqual('cohort_test_user')
    expect(res.body.password).toBeUndefined()

    const res2 = await request(app)
      .post('/api/v2/users')
      .send({
        'username': 'cohort_test_user_2',
        'password': '4444'
      })
    
    expect(res2.status).toEqual(201)
    expect(res2.body.id).toBeDefined()
    expect(res2.header.location).toEqual('/api/v2/users/' + res2.body.id)
    expect(res2.body.username).toEqual('cohort_test_user_2')
    expect(res2.body.password).toBeUndefined()
  })

  test('register -- error: username already exists', async () => {
    const res = await request(app)
      .post('/api/v2/users')
      .send({
        'username': 'cohort_test_user',
        'password': '4444'
      })
    
    expect(res.status).toEqual(201)
    
    const res2 = await request(app)
      .post('/api/v2/users')
      .send({
        'username': 'cohort_test_user',
        'password': '3333'
      })
    
    expect(res2.status).toEqual(403)
    expect(res2.text).toEqual('Username already exists')
  })

  test('login -- happy path: cookie-based auth', async() => {
    let agent = request.agent(app)
 
    let loginResponse = await agent
    .post('/api/v2/login')
    .send({
      username: 'test_admin_user',
      password: process.env.TEST_ADMIN_USER_PASSWORD
    })

    expect(loginResponse.status).toEqual(200)
    expect(loginResponse.headers['set-cookie'][0].substr(0, 3)).toEqual('jwt')
  })

  test('login -- happy path: token-based auth', async() => {
    let agent = request.agent(app)
 
    let loginResponse = await agent
    .post('/api/v2/login?sendToken=true')
    .send({
      username: 'test_admin_user',
      password: process.env.TEST_ADMIN_USER_PASSWORD
    })

    expect(loginResponse.status).toEqual(200)
    expect(loginResponse.headers['set-cookie'][0].substr(0, 3)).toEqual('jwt')

    let cookieToken = loginResponse
    .headers['set-cookie'][0]
    .substr(4).split(';')[0]

    expect(loginResponse.body.jwt).toEqual(cookieToken)
  })

  test('login -- error: username not found', async () => {
    const res = await request(app)
      .post('/api/v2/login')
      .send({
        'username': 'cohort_test_user_that_doesnt_exist',
        'password': '4444'
      })
    
    expect(res.status).toEqual(404)
    expect(res.text).toEqual('Username not found: "cohort_test_user_that_doesnt_exist"')
  })
  
  test('login -- error: incorrect password', async () => {
    const res0 = await request(app)
        .post('/api/v2/users')
        .send({
          'username': 'cohort_test_user',
          'password': '4444'
        })
      
    expect(res0.status).toEqual(201)
  
    const res = await request(app)
      .post('/api/v2/login')
      .send({
        'username': 'cohort_test_user',
        'password': '3333'
      })
    
    expect(res.status).toEqual(403)
    expect(res.text).toEqual("Incorrect password for username: cohort_test_user")
  })

  test('DELETE /users/:id -- happy path, admin user can delete users', async () => {
    let token = await login('test_admin_user', app)

    const res = await request(app)
    .delete('/api/v2/users/3')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(204)

    const res1 = await request(app)
    .delete('/api/v2/users/3')
    .set('Authorization', 'JWT ' + token)

    expect(res1.status).toEqual(404) // auth succeeded, user to delete was not found

    const res2 = await request(app)
    .get('/api/v2/events')
    .set('Authorization', 'JWT ' + token)

    const events = res2.body
    expect(events).toEqual([])
    // deleting a user should also delete all events & occasions they own
  })

  test('DELETE /users/:id -- happy path, user can delete themself', async () => {
    const token = await login('test_user_2', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .delete('/api/v2/users/4')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(204)

    const res1 = await request(app)
    .delete('/api/v2/users/4')
    .set('Authorization', 'JWT ' + token)

    expect(res1.status).toEqual(401) // auth failed because user does not exist anymore
  })

  test('DELETE /users/:id -- error, user cannot delete other user', async () => {
    const token = await login('test_user_2', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .delete('/api/v2/users/3')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(401)
    expect(res.text).toEqual("A user can only be deleted by themselves or by an admin")
  })
})


/*
 *    EVENT ROUTES
 */

 describe('Event routes', () => {
  test('GET /events -- happy path, as admin user', async () => {
    const token = await login('test_admin_user', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .get('/api/v2/events')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(200)
    expect(res.body).toHaveLength(5)

    expect(res.body[1]).toHaveProperty('label')
    expect(res.body[1].label).toEqual('demo event')

    expect(res.body[1]).toHaveProperty('occasions')
    expect(res.body[1].occasions).toHaveLength(5)
    expect(res.body[1].occasions[0]).toHaveProperty('label')
    expect(res.body[1].occasions[0].label).toEqual('Show 1')

  })

  test('GET /events -- happy path, as owning user', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .get('/api/v2/events')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(200)
    expect(res.body).toHaveLength(5)

    expect(res.body[1]).toHaveProperty('label')
    expect(res.body[1].label).toEqual('demo event')

    expect(res.body[1]).toHaveProperty('occasions')
    expect(res.body[1].occasions).toHaveLength(5)
    expect(res.body[1].occasions[0]).toHaveProperty('label')
    expect(res.body[1].occasions[0].label).toEqual('Show 1')

  })

  test('GET /events/:id', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    // event that doesn't have any occasions
    const res1 = await request(app)
    .get('/api/v2/events/1')
    .set('Authorization', 'JWT ' + token)

    expect(res1.status).toEqual(200)

    expect(res1.body).toHaveProperty('id')
    expect(res1.body.id).toEqual(1)
    expect(res1.body).toHaveProperty('label')
    expect(res1.body.label).toEqual('pimohtēwak')

    expect(res1.body.episodes).toBeDefined()
    expect(res1.body.episodes).toHaveLength(1)
    expect(res1.body.episodes[0].label).toEqual('pimohtēwak')
    expect(res1.body.episodes[0].episodeNumber).toEqual(0)
    expect(res1.body.episodes[0].cues).toBeDefined()
    expect(res1.body.episodes[0].cues).toHaveLength(0)

    //event that has occasions
    const res2 = await request(app)
    .get('/api/v2/events/2')
    .set('Authorization', 'JWT ' + token)

    expect(res2.status).toEqual(200)

    expect(res2.body).toHaveProperty('occasions')
    expect(res2.body.occasions).toHaveLength(5)
    expect(res2.body.occasions[2].state).toEqual('opened')

    expect(res2.body.episodes).toBeDefined()
    expect(res2.body.episodes).toHaveLength(1)
    expect(res2.body.episodes[0].label).toEqual('demo event')
    expect(res2.body.episodes[0].episodeNumber).toEqual(0)
    expect(res2.body.episodes[0].cues).toBeDefined()
    expect(res2.body.episodes[0].cues).toHaveLength(7)
  })

  test('GET /events/:id -- error: event not found', async () => {
    const token = await login('test_admin_user', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .get('/api/v2/events/99')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(404)

    expect(res.text).toEqual("Error: event with id:99 not found")
  })

  test('POST /events -- happy path (no episodes provided)', async () =>{
    const token = await login('test_user_2', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/events')
    .set('Authorization', 'JWT ' + token)
    .send({ label: 'new event' })

    expect(res.status).toEqual(201)
    expect(res.header.location).toEqual('/api/v2/events/6')
    expect(res.body).toHaveProperty('id')
    expect(res.body.id).toEqual(6)
    expect(res.body.label).toEqual('new event')
    expect(res.body.episodes).toBeDefined()
    expect(res.body.episodes).toHaveLength(1)
    expect(res.body.episodes[0].label).toEqual('new event')
    expect(res.body.episodes[0].episodeNumber).toEqual(0)
    expect(res.body.episodes[0].cues).toBeDefined()
    expect(res.body.episodes[0].cues).toHaveLength(0)
  })

  test('POST /events -- happy path (with episodes)', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/events')
    .set('Authorization', 'JWT ' + token)
    .send({ label: 'new event', episodes: [{
        episodeNumber: 1,
        label: 'episode 1',
        cues: [{ 
          "mediaDomain": 0,
          "cueNumber": 1,
          "cueAction": 0,
          "targetTags": ["all"]
        }]
      }] 
    })

    expect(res.status).toEqual(201)
    expect(res.header.location).toEqual('/api/v2/events/6')
    expect(res.body).toHaveProperty('id')
    expect(res.body.id).toEqual(6)
    expect(res.body.label).toEqual('new event')
    expect(res.body.episodes).toBeDefined()
    expect(res.body.episodes).toHaveLength(1)
    expect(res.body.episodes[0].label).toEqual('episode 1')
    expect(res.body.episodes[0].episodeNumber).toEqual(1)
    expect(res.body.episodes[0].cues).toBeDefined()
    expect(res.body.episodes[0].cues).toHaveLength(1)
    expect(res.body.episodes[0].cues[0]).toEqual({ 
      "mediaDomain": 0,
      "cueNumber": 1,
      "cueAction": 0,
      "targetTags": ["all"]
    })
  })

  test('DELETE /events/:id -- error: event not found', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()
    
    const res = await request(app)
    .delete('/api/v2/events/99')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(404)
    expect(res.text).toEqual("Error: event with id:99 not found")
  })

  test('DELETE /events/:id -- error: event has open occasions', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const openOccasionId = 3

    const res = await request(app)
    .delete('/api/v2/events/2')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(400)
    expect(res.text).toEqual("Error: an event with open occasions cannot be deleted. Close occasion:" + openOccasionId + " and try again.")

    const res2 = await request(app)
    .get('/api/v2/events/2')
    .set('Authorization', 'JWT ' + token)

    expect(res2.status).toEqual(200)
  })

  test('DELETE /events/:id -- happy path', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .delete('/api/v2/events/1')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(204)

    const res2 = await request(app)
    .get('/api/v2/events/1')
    .set('Authorization', 'JWT ' + token)

    expect(res2.status).toEqual(404)
  })

  test('POST /events/:id/episodes -- error: event not found', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/events/99/episodes')
    .set('Authorization', 'JWT ' + token)
    .send([{
      episodeNumber: 1,
      label: 'Act 1',
      cues: []
    }])

    expect(res.status).toEqual(404)
    expect(res.text).toEqual("Error: event with id:99 not found")
  })

  test('POST /events/:id/episodes -- error: empty payload', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/events/3/episodes')
    .set('Authorization', 'JWT ' + token)
    .send()

    expect(res.status).toEqual(400)
    expect(res.text).toEqual("Error: you must provide an array of episodes")
  })

  test('POST /events/:id/episodes -- error: non-array payload format', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/events/3/episodes')
    .set('Authorization', 'JWT ' + token)
    .send({
      episodeNumber: 1,
      label: 'Act 1',
      cues: []
    })

    expect(res.status).toEqual(400)
    expect(res.text).toEqual("Error: you must provide an array of episodes")
  })

  test('POST /events/:id/episodes -- error: episodes missing fields', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/events/3/episodes')
    .set('Authorization', 'JWT ' + token)
    .send([{
      episodeNumber: 1,
      label: 'Act 1',
      cues: 5
    }])

    expect(res.status).toEqual(400)
    expect(res.text).toEqual("Error: episodes must have 'episodeNumber', 'label', and 'cues' fields; 'cues' must be an array.")

    const res1 = await request(app)
    .post('/api/v2/events/3/episodes')
    .set('Authorization', 'JWT ' + token)
    .send([{
      episodeNumber: 1,
      cues: []
    }])

    expect(res1.status).toEqual(400)
    expect(res1.text).toEqual("Error: episodes must have 'episodeNumber', 'label', and 'cues' fields; 'cues' must be an array.")

    const res2 = await request(app)
    .post('/api/v2/events/3/episodes')
    .set('Authorization', 'JWT ' + token)
    .send([{
      label: 'Act 1',
      cues: []
    }])

    expect(res2.status).toEqual(400)
    expect(res2.text).toEqual("Error: episodes must have 'episodeNumber', 'label', and 'cues' fields; 'cues' must be an array.")

    const res3 = await request(app)
    .post('/api/v2/events/3/episodes')
    .set('Authorization', 'JWT ' + token)
    .send([{
      episodeNumber: 1,
      label: 'Act 1'
    }])

    expect(res3.status).toEqual(400)
    expect(res3.text).toEqual("Error: episodes must have 'episodeNumber', 'label', and 'cues' fields; 'cues' must be an array.")
  })

  test('POST /events/:id/episodes -- happy path', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/events/3/episodes')
    .set('Authorization', 'JWT ' + token)
    .send([{
      episodeNumber: 1,
      label: 'Act 1',
      cues: []
    }])

    expect(res.status).toEqual(200)
  })
})

/*
 *    OCCASION ROUTES
 */

describe('Occasion routes', () => {
  test('POST /occasions -- error: eventId not included', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()
    
    const res = await request(app)
    .post('/api/v2/occasions')
    .set('Authorization', 'JWT ' + token)
    .send({ 
      label: 'new occasion'
    })

    expect(res.status).toEqual(400)
    expect(res.text).toEqual('Error: request must include an existing event id (as "eventId" property)')
  })

  test('POST /occasions -- error: event for occasion does not exist', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/occasions')
    .set('Authorization', 'JWT ' + token)
    .send({ 
      label: 'new occasion', 
      eventId: 99 
    })

    expect(res.status).toEqual(404)
    expect(res.text).toEqual('Error: event with id:99 not found. To create an occasion, you must include an eventId property corresponding to an existing event.')
  })

  test('POST /occasions -- happy path', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/occasions')
    .set('Authorization', 'JWT ' + token)
    .send({ 
      label: 'new occasion', 
      eventId: 1
    })

    expect(res.status).toEqual(201)
    expect(res.header.location).toEqual('/api/v2/occasions/6')
    expect(res.body).toHaveProperty('id')
    expect(res.body.id).toEqual(6)
    expect(res.body.label).toEqual('new occasion')
  })

  test('DELETE /occasions -- error: occasion not found', async () => {
    const token = await login('test_admin_user', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .delete('/api/v2/occasions/99')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(404)
  })

  test('DELETE /occasions -- error: opened occasion cannot be deleted', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .delete('/api/v2/occasions/3')
    .set('Authorization', 'JWT ' + token)

    expect(res.status).toEqual(400)
    expect(res.text).toEqual('Error: an opened occasion cannot be deleted. Close the occasion and try again.')
  })

  test('DELETE /occasions -- happy path', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    numberOfOccasions = async () => {
      const res = await request(app)
      .get('/api/v2/events')
      .set('Authorization', 'JWT ' + token)

      expect(res.status).toEqual(200)
      
      let occasions = []
      for(event of res.body){
        if(event.occasions){
          occasions.push(...event.occasions)
        }
      }

      return occasions.length
    }

    let occasionsCount = await numberOfOccasions()

    const res1 = await request(app)
    .delete('/api/v2/occasions/1')
    .set('Authorization', 'JWT ' + token)

    expect(res1.status).toEqual(204)

    // verify that the number of occasions has gone down by one
    let newOccasionsCount = await(numberOfOccasions())
    expect(newOccasionsCount).toEqual(occasionsCount - 1)
  })

  test('POST /occasions/:id -- open occasion', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()

    const res = await request(app)
    .post('/api/v2/occasions/2')
    .set('Authorization', 'JWT ' + token)
    .send({state: 'opened'})

    expect(res.status).toEqual(200)
    expect(res.body.id).toEqual(2)
    expect(res.body.state).toEqual('opened')
    expect(app.get('cohortSession').openOccasions).toHaveLength(2)
  })

  test('POST /occasions/:id -- close occasion', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()
    
    const res = await request(app)
    .post('/api/v2/occasions/3')
    .set('Authorization', 'JWT ' + token)
    .send({state: 'closed'})

    expect(res.status).toEqual(200)
    expect(res.body.id).toEqual(3)
    expect(res.body.state).toEqual('closed')
    expect(app.get('cohortSession').openOccasions).toHaveLength(0)
  })

  test('GET /occasions/:id/qrcode', async () => {
    const token = await login('test_user_1', app)
    expect(token).toBeDefined()
    
    const res = await request(app)
    .get('/api/v2/occasions/3/qrcode')
    .set('Authorization', 'JWT ' + token)

    let qrcode = res.text

    expect(qrcode).toBeDefined()
    expect(qrcode).toEqual('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 37" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h37v37H0z"/><path stroke="#000000" d="M4 4.5h7m4 0h2m1 0h1m4 0h2m1 0h7M4 5.5h1m5 0h1m1 0h1m4 0h1m3 0h1m2 0h1m1 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m3 0h3m2 0h1m1 0h1m1 0h1m2 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m2 0h2m1 0h2m2 0h1m2 0h2m1 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m1 0h1m4 0h1m2 0h1m2 0h2m1 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m5 0h1m1 0h4m2 0h1m1 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M14 11.5h1m1 0h1m2 0h1m2 0h1m1 0h1M4 12.5h1m1 0h1m1 0h1m1 0h1m2 0h2m1 0h1m3 0h3m5 0h1m2 0h1M4 13.5h2m1 0h2m7 0h2m1 0h5m1 0h3m1 0h1m2 0h1M4 14.5h4m2 0h1m1 0h1m3 0h1m1 0h3m1 0h1m2 0h1m4 0h3M5 15.5h1m3 0h1m1 0h8m1 0h1m3 0h3m2 0h1m1 0h1M8 16.5h6m1 0h2m1 0h5m2 0h1m1 0h1m3 0h2M5 17.5h3m3 0h2m3 0h1m1 0h2m2 0h1m2 0h1m3 0h1m2 0h1M7 18.5h1m2 0h1m1 0h1m1 0h1m2 0h1m2 0h1m1 0h7m1 0h3M4 19.5h6m2 0h1m1 0h2m3 0h1m2 0h3m1 0h2m3 0h1M6 20.5h1m3 0h1m3 0h3m3 0h3m2 0h3m3 0h2M5 21.5h2m1 0h2m3 0h3m1 0h1m1 0h1m1 0h2m4 0h2m1 0h1m1 0h1M4 22.5h1m1 0h2m1 0h3m3 0h2m1 0h2m3 0h1m3 0h1m1 0h1m1 0h2M5 23.5h3m1 0h1m5 0h1m1 0h3m4 0h3m3 0h2M4 24.5h1m2 0h5m1 0h1m4 0h2m1 0h2m1 0h5M12 25.5h1m3 0h1m1 0h2m1 0h2m1 0h1m3 0h1m2 0h2M4 26.5h7m2 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h2m1 0h1m1 0h2m1 0h2M4 27.5h1m5 0h1m2 0h2m1 0h1m3 0h1m1 0h3m3 0h1m1 0h2M4 28.5h1m1 0h3m1 0h1m1 0h5m4 0h2m1 0h6m1 0h2M4 29.5h1m1 0h3m1 0h1m3 0h1m4 0h1m1 0h2m2 0h1m1 0h1m1 0h1m1 0h1M4 30.5h1m1 0h3m1 0h1m1 0h1m1 0h2m2 0h2m1 0h1m1 0h2m1 0h1m5 0h1M4 31.5h1m5 0h1m3 0h2m1 0h1m1 0h1m1 0h2m1 0h3m2 0h1m1 0h1M4 32.5h7m1 0h8m1 0h2m1 0h1m1 0h1m1 0h1m1 0h3"/></svg>\n') // have to add newline manually
  })

  /*
   *    Broadcast routes (/occasions/:id/broadcast) are tested in 
   *    cohort-websocket.test.js
   */
})




  


// DEVICE ROUTES
// defunct

  // test('devices/:id/registerForNotifications : happy path', async () => {
  //   const guid = uuid()
  //   const interimResponse = await createDevice(guid)

  //   const payload = { token: 'abcde12345' }
  //   const deviceId = interimResponse.body.id
    
  //   const res = await request(app)
  //     .patch('/api/v1/devices/' + deviceId + '/register-for-notifications')
  //     .send(payload)
  //   expect(res.status).toEqual(200)
  //   expect(res.body.apnsDeviceToken).toEqual('abcde12345')
  // })
  
  // add test for id not found

  // test('devices/register-for-notifications : error: missing token', async () => {
  //   const payload = { 'blep': '012345678901234567890123456789012345'}
  //   const res = await request(app)
  //     .patch('/api/v1/devices/1/register-for-notifications')
  //     .send(payload)
  //   expect(res.status).toEqual(400)
  //   expect(res.text).toEqual("Error: Request must include a 'token' object")
  // })

  // MOVES TO EVENT OR OCCASION
  // test('devices/set-tags', async () => {
  //   const payload = { tags: [ 'blue', 'red' ]}
  //   const res = await request(app)
  //     .patch('/api/v1/devices/1/set-tags')
  //     .send(payload)
  //   expect(res.status).toEqual(200)
  //   expect(res.body.tags).toEqual(['blue', 'red'])

  //   const payload1 = { tags: [ 'purple' ]}
  //   const res1 = await request(app)
  //     .patch('/api/v1/devices/1/set-tags')
  //     .send(payload1)
  //   expect(res1.status).toEqual(200)
  //   expect(res1.body.tags).toEqual(['purple'])
  // })

  


//   test('broadcast/push-notification : happy path (one device)', async () => {
//     // create a device
//     const guid = uuid()
//     const res1 = await createDevice(guid)
//     expect(res1.status).toEqual(200)

//     // register a device
//     const payload2 = { token: '12345', guid: guid }
//     const res2 = await request(app)
//       .post('/api/devices/register-for-notifications')
//       .send(payload2)
//     expect(res2.status).toEqual(200)

//     // test broadcast endpoint
//     const payload = { 
//       "text": "hello world",
//       "bundleId": "rocks.cohort.test",
//       "simulate": "success"
//     }

//     const res = await request(app)
//       .post('/api/broadcast/push-notification')
//       .send(payload)
//     expect(res.status).toEqual(200)
//     expect(res.text).toEqual("Sent notifications to 1/1 registered devices")
//   })
// })
