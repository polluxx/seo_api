'use strict';
module.exports = function api(options) {
    var validOpts = {
        'check': ['count']
    };
    //console.log(options);
    this.add('role:api,path:check,operation:*', function(msg, response) {
        this.act({role:'check'}, {
            type: validOpts['check'][msg.operation]
        }, response);
    });
    this.add('role:api,path:publish,operation:*', function(msg, response) {
        this.act({role:'publish'}, {
            type: validOpts['check'][msg.operation]
        }, response);
    });
    this.add('role:api,path:rabbit,operation:*', function(msg, response) {
        this.act({role:'rabbit'}, {
            type: validOpts['check'][msg.operation]
        }, response);
    });

    this.add('init:api', function(msg, response) {
        console.log(msg);
        this.act("role:web", {
            use: {
                prefix: '/api',
                pin: 'role: api, path:*',
                map: {
                    check: { GET:true,PUT:true, suffix:'/:operation' },
                    publish: { GET:true,PUT:true, suffix:'/:operation' },
                    rabbit: { GET:true,POST:true, suffix:'/:operation' }
                }
            }
        }, response);
    });
};