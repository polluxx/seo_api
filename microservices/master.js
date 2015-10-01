"use strict";
var cors = require('cors'),
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
        .client({ port: 9001, type:'tcp', pin:{role:'*', path:"*"}})

    //.add({role: 'clients', type:'serve'}, function(args, done){
    //    var seneca = this, clientItem = {};
    //
    //    args.nodes.forEach(function(client) {
    //        clientItem[client] = "count";
    //        seneca.act(clientItem, function(err, result) {
    //            if(err) return done(err);
    //
    //            return done(null, result);
    //        })
    //    });
    //})
    //.act('role:web', {use: function( req, res, next ){
    //
    //    var slice = req.url.replace(/^\/|\/$/, "").split('/');
    //        console.log(req.url);
    //    if(slice.length === 2 && 'check' == slice[0] ) {
    //        console.log(slice);
    //        // NOTE: req.seneca reference
    //        req.seneca.act({'role': slice[0], 'type':slice[1]},function(err,out){
    //            if(err) return next(err);
    //
    //            // assumes an express app
    //            res.send(out)
    //        })
    //    }
    //    else return next();
    //}})
    //.act('role:web',{use:{
    //
    //     // define some routes that start with /my-api
    //     prefix: '/api',
    //
    //     // use action patterns where role has the value 'api' and cmd has some defined value
    //     pin: {role:'check',type:'*'},
    //
    //     // for each value of cmd, match some HTTP method, and use the
    //     // query parameters as values for the action
    //     map:{
    //         top100: true,                // GET is the default
    //         concurrents: {GET:true},        // explicitly accepting GETs
    //         count: {GET:true},
    //         query: {PUT:true, OPTIONS: true},
    //         syno: {GET: true},
    //         'concurrent-keys': {GET: true},
    //         yaxmlcount: {GET: true}
    //         //qaz: {GET:true,POST:true} // accepting both GETs and POSTs
    //     }
    // }})
     .act('role:web',{use:{

         // define some routes that start with /my-api
         prefix: '/rabbit',

         // use action patterns where role has the value 'api' and cmd has some defined value
         pin: {role:'rabbit',type:'*'},

         // for each value of cmd, match some HTTP method, and use the
         // query parameters as values for the action
         map:{
            pub: {GET: true}                // GET is the default
         }
     }})
     .act('role:web',{use:{
         prefix: '/parse',
         pin: {role:'parse',type:'*'},
         map:{
            checker: {PUT: true, OPTIONS: true}
         }
     }})
        .act('role:web',{use:{
            prefix: '/clients',
            pin: {role:'clients',type:'*'},
            map:{
                serve: {GET: true, OPTIONS: true}
            }
        }})
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

    //app.use(cors(corsOptionsDelegate));
    app.use( require("body-parser").json());
    app.use( seneca.export('web') );


    app.listen(3000);