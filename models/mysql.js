var mysql = require('mysql'),
  config = require('../config.js'),
  Mysql = {
      connect: function() {
          return new Promise(function(resolve, reject) {
              var connection = mysql.createConnection(config.dbs.mysql);

              connection.connect(function(err) {
                  if(err) reject(err);

                  resolve(connection);
              });

          });
      },
      proxies: function(params) {
        var self = this, limit = params.limit || 10, page = limit * ((params.page || 1)-1),
            status = params.status !== undefined ? params.status : 1, query;
        if(limit > 100) limit = 100;
        return new Promise(function(resolve, decline) {
              proxiesData = self.connect();

              proxiesData.then(function(connection) {
                  query = 'SELECT * FROM seo_proxy where proxy_status = '+ status +' limit '+page+','+limit;
                  if(params.count !== undefined) {
                      query = 'SELECT count(*) FROM seo_proxy where proxy_status = '+ status;
                  }

                  connection.query(
                      query,
                      function(err, row) {
                          if(err) decline(err);

                          resolve(row);
                      }
                  );

                  // Release connection
                  //console.log('connect resolved');
                  connection.end();
              }).
              catch(function(err) {
                  connection.end();
                  decline(err);
              });
        });
      }
  };

  module.exports = Mysql;
