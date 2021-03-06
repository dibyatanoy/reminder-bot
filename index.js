'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const app = express()


var reminders = []
let Wit = null
let log = null

try {
  // if running from repo
  Wit = require('../').Wit;
  log = require('../').log;
} catch (e) {
  Wit = require('node-wit').Wit;
  log = require('node-wit').log;
}
var moment = require('moment')


const WIT_TOKEN = process.env.WIT_TOKEN;
const token = process.env.FB_APP_TOKEN;


app.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// Process application/json
app.use(bodyParser.json())

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
        res.send(req.query['hub.challenge'])
    }
    res.send('Error, wrong token')
})

// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})



//////////////////////////////////////////////////

const sessions = {};

const lastEntityValue = (entities, entity) => {
  const val = entities && entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][entities[entity].length - 1].value
  ;
  if (!val) {
    return null;
  }
  return typeof val === 'object' ? val.value : val;
};

function init_authorize(){

    fs.readFile('client_secret.json', function processClientSecrets(err, content) {
    if (err) {
        console.log('Error loading client secret file: ' + err);
        return;
    }
    // Authorize a client with the loaded credentials, then call the
    // Google Sheets API.
    authorize(JSON.parse(content), handle);
    });
}

app.post('/webhook/', function (req, res) {


    let messaging_events = req.body.entry[0].messaging
    for (let i = 0; i < messaging_events.length; i++) {
        let event = req.body.entry[0].messaging[i]
        let sender = event.sender.id
        if (event.message && event.message.text) {
            let text = event.message.text
            const sessionId = findOrCreateSession(sender)
            //let reminder_event = 
            //parseResponse(sender, text)
            wit.runActions(
                sessionId,
                text,
                sessions[sessionId].context
            ).then((context) => {
                sessions[sessionId].context = context
            })
            .catch((err) => {
                console.error('Oops! Got an error from Wit: ', err.stack || err);
            })
            // if (reminder_event.err)
            //     sendTextMessage(sender, reminder_event.err)
            // else{
            //     reminder_event.sender = sender
            //     reminders.push(reminder_event)
            //     sendTextMessage(sender, "Reminder created!")
            // }
        }
    }
    res.sendStatus(200)
})

function sendReminder(rem_event){

    let messageData = { text:"REMINDER: " + rem_event.evnt + " at " + rem_event.actualtime}
    var listLen = reminders.length

    for (var i = 0; i < listLen; i++){
        if(JSON.stringify(rem_event) == JSON.stringify(reminders[i])){
            reminders.splice(i, 1)
            break
        }
    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:rem_event.sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}

function createReminder(sender, rem_event){

    
    rem_event.sender = sender
    reminders.push(rem_event)
    setTimeout(sendReminder, rem_event.etime, rem_event)

    return
}

function calcInterval(reminder_event, sender, etime, context, entities, resolve, reject){

    var hours = etime.getHours()
    var minutes = etime.getMinutes()
    var seconds = etime.getSeconds()
    var curr_date = new Date()
    var curr_hr = curr_date.getHours()
    var curr_min = curr_date.getMinutes()
    var curr_sec = curr_date.getSeconds()
    //var timezone = getTimeZone(sender)

    request({
        url: 'https://graph.facebook.com/v2.6/' + sender,
        qs: {access_token:token, fields: "timezone"},
        method: 'GET',
        json: true,
    }, function(error, response, body) {
        if (error) {
            console.log('Error fetching timezone: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }else{
            var timezone = body.timezone
            var interval = (hours * 3600 + minutes * 60 + seconds) - (((curr_hr + timezone)%24) * 3600 + curr_min * 60 + curr_sec)
            
            interval = etime - moment.utc().utcOffset(timezone * 60)
            reminder_event.sender = sender
            reminder_event.etime = interval
            reminder_event.actualtime = moment.utc(reminder_event.actualtime).utcOffset(timezone * 60).format("HH:mm, ddd Do MMM")
            context.event_time = reminder_event.actualtime

            // needs new context
            if(interval <= 0){
                reminder_event.err = "Invalid time, must be after the current time."
                context.before_ctime = true
                delete context.event_time
                return resolve(context)
            }
            reminder_event.sender = sender
            createReminder(sender, reminder_event)
            //delete context.event
            //delete context.event_time
            delete context.before_ctime

            sessions[context.sessionId].context = context
            return resolve(context)
            //return createReminder(sender, reminder_event)
        }
    })

    //console.log("Timezone: GMT+%d", timezone)

    //var interval = (hours * 3600 + minutes * 60) - ((curr_hr + timezone) * 3600 + curr_min * 60 + curr_sec)
    //console.log("ehrs: %d, emin: %d, curr_hr: %d, curr_min: %d", hours, minutes, curr_hr, curr_min)
    //return interval * 1000
}

function fetchTimezone(context, entities, resolve, reject){

    var sender = context.sender
    request({
        url: 'https://graph.facebook.com/v2.6/' + sender,
        qs: {access_token:token, fields: "timezone"},
        method: 'GET',
        json: true,
    }, function(error, response, body) {
        if (error) {
            console.log('Error fetching timezone: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }else{
            
            var timezone = body.timezone
            var usrTime = moment.utc().utcOffset(timezone * 60).format()
            //var utc = date.getTime() + (date.getTimezoneOffset() * 60000)

            //var localDate = new Date(utc + 3600000 * timezone)
            context.reference_time = usrTime

            sessions[context.sessionId].context = context
            return resolve(context)
            //return createReminder(sender, reminder_event)
        }
    })    
}

function parseResponse(context, entities, resolve, reject){

    var sender = context.sender
    var evnt
    // if (!('event' in context)){
    //     evnt = lastEntityValue(entities, "reminder")
    // }else{
    //     evnt = context.event
    // }

    delete context.show

    if (!('reference_time' in context)){
        delete context.event
        delete context.event_time
        delete context.missing_time
        delete context.before_ctime
        delete context.is_error
        context.intro = true

        return fetchTimezone(context, entities, resolve, reject)
    }else{

        delete context.intro
    }
    evnt = lastEntityValue(entities, "reminder")
    if (!evnt && ('event' in context))
        evnt = context.event

    var time = lastEntityValue(entities, "datetime")

    if(!evnt){
        context.is_error = true
        delete context.event
        delete context.event_time
        delete context.missing_time
        delete context.before_ctime
    }else if(!time){
        
        context.missing_time = true
        context.event = evnt
        delete context.event_time
        delete context.is_error
        delete context.before_ctime
        delete context.show
    }else{
        context.event = evnt
        context.event_time = time

        var strtime = String(time)
        var etime = new Date(strtime)

        var reminder_event = {sender: null, evnt: "", etime: 0, actualtime: 0, err: ""}
        reminder_event.sender = sender
        reminder_event.evnt = evnt
        reminder_event.actualtime = strtime

        delete context.missing_time
        delete context.is_error
        delete context.before_ctime

        return calcInterval(reminder_event, sender, etime, context, entities, resolve, reject)
    }

    sessions[context.sessionId].context = context
    return resolve(context)
}

function listAllReminders(sender){

    var userReminders = []
    var listLen = reminders.length

    for (var i = 0; i < listLen; i++){
        if(sender == reminders[i].sender){
            userReminders.push(reminders[i])
        }
    }

    return userReminders
}

function sendTextMessage(sender, text, context){
    let messageData = { text:text }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }else{
                if ('show' in context){
                    
                    let messageData = {"attachment": {
                        "type": "template",
                        "payload": {
                            "template_type": "generic",
                            "elements": []
                        }
                    }}

                    var numReminders = context.reminder_list.length

                    for (var i = 0; i < numReminders; i++){
                        var newElem = {
                            "title": context.reminder_list[i].evnt,
                            "subtitle": "at " + context.reminder_list[i].actualtime,
                        }

                        messageData.attachment.payload.elements.push(newElem)
                    }

                    request({
                        url: 'https://graph.facebook.com/v2.6/me/messages',
                        qs: {access_token:token},
                        method: 'POST',
                        json: {
                            recipient: {id:sender},
                            message: messageData,
                        }
                    }, function(error, response, body) {
                        if (error) {
                            console.log('Error sending messages: ', error)
                        } else if (response.body.error) {
                            console.log('Error: ', response.body.error)
                        }
                    })
                }
        }
    })

}

///////////////////////////////////////////////

const findOrCreateSession = (fbid) => {

    let sessionId;

    Object.keys(sessions).forEach(k => {
        if (sessions[k].fbid === fbid){
            sessionId = k;
        }
    });
    if (!sessionId){
        sessionId = new Date().toISOString();
        sessions[sessionId] = {fbid: fbid, context: {sender: fbid, sessionId: sessionId}};
    }
    return sessionId;
};

const actions = {
    send({sessionId}, {text}){
        const recipientId = sessions[sessionId].fbid;
        var context = sessions[sessionId].context
        if (recipientId) {
            // Yay, we found our recipient!
            // Let's forward our bot response to her.
            // We return a promise to let our bot know when we're done sending

            return sendTextMessage(recipientId, text, context)
            
        } else {
            console.error('Oops! Couldn\'t find user for session:', sessionId);
            // Giving the wheel back to our bot
            return Promise.resolve()
        }
    },
    processReminder({context, entities}){

        return new Promise(function(resolve, reject){
            // because async call, pass all of this info (context, entities, resolve, reject)
            // to parseResponse
            return parseResponse(context, entities, resolve, reject)
            //return resolve(context)
        })

    },
    showReminders({context, entities}){
        return new Promise(function(resolve, reject){
            delete context.event
            delete context.event_time
            delete context.before_ctime
            delete context.is_error
            delete context.intro

            context.show = true
            context.reminder_list = listAllReminders(context.sender)

            sessions[context.sessionId].context = context

            return resolve(context)
        })
    },
};

const wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.INFO)
});