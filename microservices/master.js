"use strict";
var cors = require('cors'),
    rabbit = require('../services/rabbit'),
    io = require('socket.io')(8002),
    timeout = require('connect-timeout'),
    config = require('../config'),
    seneca = require('seneca')({
        transport:{
            web:{
                timeout:20000
            },
            tcp:{
                timeout:120000
            }
        }
    }),
    app = require('express')();


    seneca
        .use('api')
        .use('parser')

        .client({host:config.clients.api, port: 9001, type:'tcp', pin:{role:'api', path:"*"}})
        .client({host:config.clients.parser, port: 9002, type:'tcp', pin:{role:'parser', path:"*"}})

        .add({role: 'rabbit', type: 'sub'}, function(args, done) {
            rabbit.sub();
            done(null, {message: "LISTENING"});
        })
        .add({role: 'io', type: 'sub'}, function(args, done) {
            console.log("start");
            io.on('connection', function (socket) {
                console.log('client connected');
                socket.on('message', function (mess) {
                    //console.log(mess);
                    //socket.send('hello');
                    io.send(mess);
                });
                socket.on('disconnect', function () {
                    console.log('client disconnected');
                });
            });

            done(null, {message: "LISTEN WEBSOCK"});
        })

    .act({role: 'rabbit', type: 'sub'})
    .act({role: 'io', type: 'sub'})
    //.act('role:web',{use:{
    // prefix: '/parse',
    // pin: {role:'parse',type:'*'},
    // map:{
    //    checker: {PUT: true, OPTIONS: true}
    // }
    //}})
    .listen({timeout:22000});

    var whitelist = ['http://cm.ria.local:8000', 'http://seo.ria.com', 'http://cm.ria.com', 'http://cm.ria.local', 'http://cm.ria.local:8002'],
    corsOptionsDelegate = function(req, callback){
        var corsOptions;
        if(whitelist.indexOf(req.header('Origin')) !== -1){
            corsOptions = { origin: true, credentials: true }; // reflect (enable) the requested origin in the CORS response
        }else{
            corsOptions = { origin: false }; // disable CORS for this request
        }
        callback(null, corsOptions); // callback expects two parameters: error and options
    };

    app.use(cors(corsOptionsDelegate));
    app.use( require("body-parser").json());
    app.use( seneca.export('web') );
    app.use(timeout('60s'));

    app.listen(3000);