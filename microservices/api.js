'use strict';
module.exports = function api(options) {
    var validOpts = {
        'check': ['count']
    };
    //console.log(options);
    this.add('role:api,path:check', function(msg, response) {
        console.log(msg);

        console.log("!!!!!!!!!!!!!!!!!!!!!!");
        console.log(msg.operation);
        console.log("!!!!!!!!!!!!!!!!!!!!!!");
        this.act({role:'check'}, {
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
                    check: { GET:true, suffix:'/:operation' }
                }
            }
        }, response);
    });
};