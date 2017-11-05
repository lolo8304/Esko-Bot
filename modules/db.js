// add mongo connection
var mongo = require('mongodb');
var monk = require('monk');

module.exports = Database;

function Database () {

  //=========================================================
  // Start Models
  //=========================================================

  // Connect to remote DB, settings are extended due to Firefall issues between nodejs -> mongodb
  // depending on the installed mongodb driver, settings are different
  // poolSize vs maxPoolSize
  // keepAlive vs socketOptions.keepAlive
  // connectTimeoutMS vs socketOptions.connectTimeoutMS

  if (!process.env.DB_APP_URL) {
    throw new Error('DB_APP_URL not defined as environment variable');
  }

  var dbURL = process.env.DB_APP_USER+':'+process.env.DB_APP_PWD+'@'+process.env.DB_APP_URL
      +'?'
      +       'maxPoolSize=3'
      +'&'+   'poolSize=3'
      +'&'+   'keepAlive=60000'
      +'&'+   'socketOptions.keepAlive=60000'
      +'&'+   'connectTimeoutMS=10000'
      +'&'+   'socketOptions.connectTimeoutMS=10000'
      +'&'+   'reconnectTries=5';

  // uncomment for localhost database
  if (!process.env.DB_APP_USER) {
      dbURL = process.env.DB_APP_URL;
  } else {
    if (!process.env.DB_APP_USER) {
      throw new Error('DB_APP_USER not defined as environment variable');
    }
    if (!process.env.DB_APP_PWD) {
      throw new Error('DB_APP_PWD not defined as environment variable');
    }
  }

  var localDB = monk(dbURL);
  console.log("mongodb connected with URL="+dbURL);

  return new DB(localDB);

};


function DB(db) {
    this.db = db;
    this.f = function(name) {
      return "hello"+name;
    }
}