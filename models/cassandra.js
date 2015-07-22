var cassandra = require('cassandra-driver'),
  ASQ = require('asynquence'),
  //cassandraInit = require('../models/cassandrainit'),
  Cassandra = {
    client: null,
    params: {
      host: "http://213.95.148.86/",
      keyspaces: [
        'counterks',
        'avp',
        'cobrand'
      ]
    },
    initialize: function(done) {
        this.client = new cassandra.Client({contactPoints: [this.params.host], keyspace: 'avp'});
        this.client.connect(function (err) {
            console.log('inited');

            if(err) done({"error": "Error when trying to connect DB: "+ err});

            done("OK");
        });
        console.log('init cassandra connection');

    },
    list: function (params) {
      var self = this;
      ASQ()
      .then(function(done,msg){
          self.initialize(done);
      })
      .then(function(done,msg){
          if(msg !== "OK") done(msg);
          console.log('start request');
          self.client.execute("SELECT * FROM rank_log limit 1", function (err, result) {
            console.log(result);
            console.log(err);
            //var user = result.rows[0];
            //The row is an Object with column names as property keys.
            //console.log(user);
            done(result);
          });
      }).or(function(err){
          //reject(err);
          console.log(err); // ReferenceError: foo is not defined
      });


    },
    stream: function() {
        this.client.stream('SELECT time, val FROM temperature WHERE station_id=', ['abc'])
          .on('readable', function () {
            //readable is emitted as soon a row is received and parsed
            var row;
            while (row = this.read()) {
              console.log('time %s and value %s', row.time, row.val);
            }
          })
          .on('end', function () {
            //stream ended, there aren't any more rows
          })
          .on('error', function (err) {
            //Something went wrong: err is a response error from Cassandra
          });
    }
  };
  //Cassandra.prototype = Object.create(cassandraInit.prototype);
  //Cassandra.prototype.constructor = Cassandra;

  module.exports = Cassandra;
