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

              // Release connection
              connection.end();
          });
      },
      proxies: function(params) {
        var self = this;
        return new Promise(function(resolve, decline) {
              proxiesData = self.connect();
              proxiesData.then(function(connection) {
                  connection.queryRow(
                      'SELECT * FROM proxies limit ?', [3],
                      function(err, row) {
                          console.dir({queryRow:row});
                      }
                  );
              }).
              catch(function(err) {
                  decline(err);
              });
        });
      }
  };

  module.exports = Mysql;
