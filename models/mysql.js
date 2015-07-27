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
        var self = this;
        return new Promise(function(resolve, decline) {
              proxiesData = self.connect();

              proxiesData.then(function(connection) {

                  connection.query(
                      'SELECT * FROM seo_proxy where proxy_status = 1 limit 3',
                      function(err, row) {
                          console.log(row);
                          console.log(err);
                          //console.dir({queryRow:row});
                      }
                  );

                  // Release connection
                  console.log('connect resolved');
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
