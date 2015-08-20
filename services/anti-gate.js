var antigate = require('antigate'),
  config = require('../config.js'),
  Antigate = {
      process: function(location) {
          return new Promise(function(resolve, decline) {
              var ag = new antigate(config.services.antigate.token);
              // Recognize the captcha by URL
              location = decodeURI(location);
              //location = "https://ipv4.google.com/sorry/image?id=1376512834319685466&hl=uk";

              ag.processFromURL(location, function(error, text, id) {
                  console.log(text);

                  console.log("loc: "+ location);
                  if (error !== null) {
                      decline(error);
                  } else {
                      resolve(text);
                  }
              });
          });

      },
      makeOther: function() {


        // Recognize the captcha from file
        ag.processFromFile('CAPTCHA_FILE_PATH', function(error, text, id) {
            if (error) {
                throw error;
            } else {
                console.log(text);
            }
        });

        // Recognize the captcha from base64 string
        ag.process('BASE_64_STRING', function(error, text, id) {
            if (error) {
                throw error;
            } else {
                console.log(text);
            }
        });

        // Report bad captcha
        ag.report('CAPTCHA_ID_HERE');

        // Get you blanace
        ag.getBalance(function(error, balance) {
            if (error) {
                throw error;
            } else {
                console.log(balance);
            }
        });


      }
  };

module.exports = Antigate;
