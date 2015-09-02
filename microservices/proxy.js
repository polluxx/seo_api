
'use strict';

var
    rabbit = require('../services/rabbit'),
    mysql = require('../models/mysql.js'),
    fm = require('../models/files.js'),
    co = require('co'),
    seneca = require('seneca')({
        transport:{
            web:{
                timeout:20000
            },
            tcp:{
                timeout:120000
            }
        }
    })
    // PROXIES
    .add({role: 'mysql', type: 'proxies'}, function(args, done) {
        if(args.pass === undefined || args.pass !== "nD54zM1") done(true, {error: "you don't have permissions"});

        var data = mysql.proxies(args);
        co(data).then(function (value) {
            done(null, {data:value});
        }, function (err) {
            done(null, {data:null, error: err.stack});
        });
    })
    .add({role: 'fm', type: 'cookies'}, function(args, done) {
        if(args.pass === undefined || args.pass !== "nD54zM1") done(true, {error: "you don't have permissions"});

        var path = args.path !== undefined ? args.path : null,
            data = fm.openYandexCookies(path);
        co(data).then(function (value) {
            done(null, {data:value});
        }, function (err) {
            done(null, {data:null, error: err.stack});
        });
    })
    .listen({timeout:22000});

